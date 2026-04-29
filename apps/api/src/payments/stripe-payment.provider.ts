import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { env } from "../env";
import type {
  CreateCheckoutSessionArgs,
  CreateCheckoutSessionResult,
  ParsedWebhookEvent,
  PaymentProvider,
  RefundArgs,
  RefundResult,
} from "./payment-provider.interface";

/**
 * Stripe-backed payment provider. Outbound is the official Node SDK;
 * inbound webhook signature verification is HMAC-SHA256 over the raw body
 * + the timestamp Stripe puts in the signature header.
 *
 * Constructor reads creds from env at boot. Key rotation needs an API
 * restart — fine for now.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly client: Stripe;
  private readonly webhookSecret: string;

  constructor() {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
      // The env validator already enforces this when PAYMENT_PROVIDER=stripe,
      // but we double-check so a misconfigured factory call surfaces clearly.
      throw new Error(
        "StripePaymentProvider requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET",
      );
    }
    this.client = new Stripe(env.STRIPE_SECRET_KEY);
    this.webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  }

  async createCheckoutSession(
    args: CreateCheckoutSessionArgs,
  ): Promise<CreateCheckoutSessionResult> {
    const tipCents = args.tipCents ?? 0;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: args.amountCents,
          product_data: { name: args.productName },
        },
      },
    ];
    if (tipCents > 0) {
      // Render tip as its own line item so the customer sees the breakdown
      // on the Stripe-hosted checkout page and on the receipt. The
      // PaymentIntent we get back is for the sum (services + tip).
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: tipCents,
          product_data: { name: "Tip" },
        },
      });
    }

    const session = await this.client.checkout.sessions.create(
      {
        mode: "payment",
        line_items: lineItems,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        customer_email: args.customerEmail,
        metadata: args.metadata,
        // Stripe doesn't auto-copy Checkout Session metadata onto the
        // underlying PaymentIntent. Without this, an early
        // payment_intent.payment_failed (one that arrives before the
        // session.completed event) has no metadata for our handler to
        // correlate back to the Payment row, so it'd silently log + skip
        // and the row would stay PENDING forever.
        payment_intent_data: { metadata: args.metadata },
      },
      // Stripe's HTTP-level idempotency: a retry with the same key is a no-op
      // and returns the original session. Pairing this with our DB-level
      // Payment.id (which we use as the key) means a worker crash between
      // INSERT and provider call is safe to retry.
      { idempotencyKey: args.idempotencyKey },
    );

    if (!session.url) {
      throw new Error(
        `Stripe session ${session.id} returned no url — refusing to continue`,
      );
    }
    this.logger.log(
      `Created Stripe Checkout Session sid=${session.id} subtotal=${args.amountCents} tip=${tipCents} ${args.currency}`,
    );
    return { providerSessionId: session.id, url: session.url };
  }

  async refundPayment(args: RefundArgs): Promise<RefundResult> {
    const refund = await this.client.refunds.create(
      {
        payment_intent: args.providerPaymentId,
        ...(args.amountCents !== undefined
          ? { amount: args.amountCents }
          : {}),
      },
      { idempotencyKey: args.idempotencyKey },
    );
    this.logger.log(
      `Issued Stripe refund id=${refund.id} target=${args.providerPaymentId} amount=${refund.amount} status=${refund.status}`,
    );
    return {
      providerRefundId: refund.id,
      status: (refund.status ?? "pending") as RefundResult["status"],
      amountCents: refund.amount,
    };
  }

  verifyAndParseWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent {
    // constructEvent throws on bad signature / replay (tolerance default 5 min).
    // We let it bubble so the controller maps it to a 400.
    const event = this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
    return { id: event.id, type: event.type, data: event.data };
  }
}
