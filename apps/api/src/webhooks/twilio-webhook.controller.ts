import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import {
  ActorType,
  MessageDirection,
  MessageStatus,
  Prisma,
} from "@prisma/client";
import { EventType } from "@shearsimp/shared";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { SkipTenant } from "../tenant/skip-tenant.decorator";
import { env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import {
  MESSAGING_PROVIDER,
  type MessagingProvider,
} from "../messaging/messaging-provider.interface";

const SOURCE = "twilio";

// Subset of Twilio's inbound SMS form params we read. They arrive
// application/x-www-form-urlencoded — Nest decodes via the default body
// parser. Fields not listed here (FromCity, FromCountry, …) are present in
// the body and used for signature validation but we don't store them.
interface TwilioSmsBody {
  MessageSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  [key: string]: string | undefined;
}

/**
 * Twilio → ShearSimplicity inbound SMS. Configured in the Twilio console
 * (Messaging → Services → Inbound webhook → POST <api>/webhooks/twilio/sms).
 *
 * Salon routing in 4a: the single shared TWILIO_FROM_NUMBER means we can't
 * use the To header to route. We look up the sender by phone across all
 * salons; if a unique Client matches we store under their salon, otherwise
 * we log + drop (and still 200 so Twilio doesn't retry forever). Per-salon
 * numbers in 4b will let us route by To directly.
 */
@Controller("webhooks/twilio/sms")
export class TwilioWebhookController {
  private readonly logger = new Logger(TwilioWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGING_PROVIDER)
    private readonly messaging: MessagingProvider,
  ) {}

  @Public()
  @SkipTenant()
  @Post()
  @HttpCode(200)
  // Twilio expects a TwiML body in the response — empty <Response/> means
  // "no auto-reply". The header has to be set explicitly because the body
  // is a string, not JSON.
  @Header("content-type", "text/xml")
  async handle(
    @Req() req: Request,
    @Body() body: TwilioSmsBody,
  ): Promise<string> {
    const signature = req.header("x-twilio-signature");
    if (!signature) {
      throw new BadRequestException("Missing X-Twilio-Signature header");
    }

    // Reconstruct the URL Twilio used to compute the signature. Behind a
    // reverse proxy that rewrites Host, set TWILIO_WEBHOOK_PUBLIC_URL so
    // the validator sees the same URL the carrier did.
    const url =
      env.TWILIO_WEBHOOK_PUBLIC_URL ?? buildRequestUrl(req);

    const params = stringifyParams(body);
    const valid = this.messaging.validateInboundSignature({
      signature,
      url,
      params,
    });
    if (!valid) {
      throw new BadRequestException("Invalid Twilio signature");
    }

    const sid = body.MessageSid;
    const from = body.From;
    const to = body.To;
    const messageBody = body.Body ?? "";
    if (!sid || !from || !to) {
      throw new BadRequestException(
        "Missing MessageSid / From / To in webhook body",
      );
    }

    // Salon routing: find a client by phone. In 4a we expect each phone to
    // belong to one salon — if we get multiple matches we log and skip
    // rather than risk routing to the wrong one.
    const matches = await this.prisma.client.findMany({
      where: { phone: from },
      select: { id: true, salonId: true, displayName: true },
      take: 2,
    });
    if (matches.length === 0) {
      this.logger.log(
        `Inbound SMS from ${from} sid=${sid} matched no client — dropping`,
      );
      return TWIML_EMPTY;
    }
    if (matches.length > 1) {
      this.logger.warn(
        `Inbound SMS from ${from} sid=${sid} matched ${matches.length} clients — ambiguous, dropping`,
      );
      return TWIML_EMPTY;
    }
    const match = matches[0]!;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedWebhookEvent.create({
          data: { source: SOURCE, externalEventId: sid, eventType: "sms.inbound" },
        });
        const message = await tx.message.create({
          data: {
            salonId: match.salonId,
            clientId: match.id,
            channel: "SMS",
            direction: MessageDirection.INBOUND,
            status: MessageStatus.RECEIVED,
            toAddress: to,
            fromAddress: from,
            body: messageBody,
            providerMessageId: sid,
          },
        });
        await tx.domainEvent.create({
          data: {
            salonId: match.salonId,
            aggregateType: "MESSAGE",
            aggregateId: message.id,
            eventType: EventType.MESSAGE_SMS_RECEIVED,
            payload: {
              providerMessageId: sid,
              from,
              to,
              clientId: match.id,
            } satisfies Prisma.InputJsonValue,
            actorType: ActorType.CLIENT,
          },
        });
      });
    } catch (err) {
      if (isProcessedWebhookEventDuplicate(err)) {
        this.logger.log(`Twilio sid ${sid} already processed; skipping`);
        return TWIML_EMPTY;
      }
      throw err;
    }
    return TWIML_EMPTY;
  }
}

const TWIML_EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

function buildRequestUrl(req: Request): string {
  // protocol + host + originalUrl reconstructs what the client (Twilio) hit,
  // including any query string. originalUrl preserves the path Nest didn't
  // strip — important for /webhooks/twilio/sms.
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = req.header("host") ?? "";
  return `${proto}://${host}${req.originalUrl}`;
}

function stringifyParams(body: TwilioSmsBody): Record<string, string> {
  // Twilio's validator wants each param as a string. The body parser may
  // hand us numbers / nested objects in edge cases; coerce to string and
  // drop anything that doesn't have a representation.
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string") out[k] = v;
    else if (v != null) out[k] = String(v);
  }
  return out;
}

function isProcessedWebhookEventDuplicate(err: unknown): boolean {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const meta = err.meta as { target?: string | string[] } | undefined;
    if (!meta?.target) return false;
    const t = meta.target;
    return Array.isArray(t)
      ? t.some((c) => c.includes("source") || c.includes("externalEventId"))
      : t.includes("source") || t.includes("externalEventId");
  }
  return false;
}
