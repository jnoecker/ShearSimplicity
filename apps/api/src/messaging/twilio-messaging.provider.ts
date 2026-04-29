import { Injectable, Logger } from "@nestjs/common";
import twilio, { validateRequest, type Twilio } from "twilio";
import { env } from "../env";
import type {
  MessagingProvider,
  SendSmsArgs,
  SendSmsResult,
  ValidateInboundArgs,
} from "./messaging-provider.interface";

/**
 * Twilio-backed SMS provider. Outbound goes through the official Node SDK;
 * inbound signature verification is HMAC-SHA1 over the request URL + sorted
 * form params (Twilio's `validateRequest`).
 *
 * The constructor reads creds from env at boot. If the auth token rotates,
 * the API needs a restart — that's fine for now.
 */
@Injectable()
export class TwilioMessagingProvider implements MessagingProvider {
  private readonly logger = new Logger(TwilioMessagingProvider.name);
  private readonly client: Twilio;
  private readonly authToken: string;

  constructor() {
    if (
      !env.TWILIO_ACCOUNT_SID ||
      !env.TWILIO_AUTH_TOKEN ||
      !env.TWILIO_FROM_NUMBER
    ) {
      // The env validator already enforces this when MESSAGING_PROVIDER=twilio,
      // but we double-check so a misconfigured factory call surfaces clearly.
      throw new Error(
        "TwilioMessagingProvider requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER",
      );
    }
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    this.authToken = env.TWILIO_AUTH_TOKEN;
  }

  async sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
    const message = await this.client.messages.create({
      to: args.to,
      from: args.from,
      body: args.body,
    });
    this.logger.log(
      `Sent SMS sid=${message.sid} to=${args.to} status=${message.status}`,
    );
    return {
      providerMessageId: message.sid,
      status: mapStatus(message.status),
    };
  }

  validateInboundSignature(args: ValidateInboundArgs): boolean {
    return validateRequest(this.authToken, args.signature, args.url, args.params);
  }
}

function mapStatus(s: string | null): SendSmsResult["status"] {
  // Twilio's create-time status set: queued, accepted, sending, sent.
  // Final states (delivered, undelivered, failed) only arrive on the status
  // callback. Treat queued/accepted/sending as QUEUED so the Message row
  // doesn't claim "SENT" before the carrier has actually accepted it.
  switch (s) {
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "failed":
    case "undelivered":
      return "FAILED";
    default:
      return "QUEUED";
  }
}
