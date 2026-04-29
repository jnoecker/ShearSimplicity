import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Webhook, WebhookVerificationError } from "svix";
import { Public } from "../auth/public.decorator";
import { SkipTenant } from "../tenant/skip-tenant.decorator";
import { env } from "../env";
import {
  ClerkWebhookService,
  type ClerkWebhookEvent,
} from "./clerk-webhook.service";

/**
 * Clerk → ShearSimplicity sync. Configured in the Clerk dashboard
 * (Webhooks → add endpoint, point at `<api>/webhooks/clerk`, copy the
 * signing secret into `CLERK_WEBHOOK_SECRET`).
 *
 * Public + SkipTenant: the request carries no session — its trust is
 * established entirely by the svix signature.
 */
@Controller("webhooks/clerk")
export class ClerkWebhookController {
  constructor(private readonly service: ClerkWebhookService) {}

  @Public()
  @SkipTenant()
  @Post()
  @HttpCode(200)
  async handle(@Req() req: Request): Promise<{ received: true }> {
    if (!env.CLERK_WEBHOOK_SECRET) {
      throw new BadRequestException("Clerk webhook secret not configured");
    }

    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException("Raw body unavailable for signature check");
    }

    const headers = {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    };

    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(env.CLERK_WEBHOOK_SECRET).verify(
        raw.toString("utf8"),
        headers,
      ) as ClerkWebhookEvent;
    } catch (err) {
      if (err instanceof WebhookVerificationError) {
        throw new BadRequestException("Invalid Clerk webhook signature");
      }
      throw err;
    }

    const eventId = headers["svix-id"];
    await this.service.process(eventId, event);
    return { received: true };
  }
}
