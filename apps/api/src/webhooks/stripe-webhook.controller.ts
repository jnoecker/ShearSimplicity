import {
  BadRequestException,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { SkipTenant } from "../tenant/skip-tenant.decorator";
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from "../payments/payment-provider.interface";
import { StripeWebhookService } from "./stripe-webhook.service";

/**
 * Stripe → ShearSimplicity payment lifecycle. Configure in the Stripe
 * dashboard: Developers → Webhooks → add endpoint, point at
 * `<api>/webhooks/stripe`, copy the signing secret to STRIPE_WEBHOOK_SECRET,
 * subscribe to: checkout.session.completed, payment_intent.payment_failed.
 *
 * Public + SkipTenant: trust is established by the signature, not a session.
 */
@Controller("webhooks/stripe")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly service: StripeWebhookService,
  ) {}

  @Public()
  @SkipTenant()
  @Post()
  @HttpCode(200)
  async handle(@Req() req: Request): Promise<{ received: true }> {
    const signature = req.header("stripe-signature");
    if (!signature) {
      throw new BadRequestException("Missing Stripe-Signature header");
    }
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException("Raw body unavailable for signature check");
    }

    let event;
    try {
      event = this.provider.verifyAndParseWebhook(raw, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Stripe webhook signature rejected: ${message}`);
      throw new BadRequestException("Invalid Stripe signature");
    }

    await this.service.process(event);
    return { received: true };
  }
}
