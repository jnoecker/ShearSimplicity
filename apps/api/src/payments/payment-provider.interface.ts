export const PAYMENT_PROVIDER = Symbol("PaymentProvider");

export interface CreateCheckoutSessionArgs {
  /** Our internal Payment.id; passed to the provider as their idempotency key. */
  idempotencyKey: string;
  /** Subtotal — the services portion only, no tip. */
  amountCents: number;
  /** Optional gratuity. Rendered as a separate line item on the checkout
   *  page + receipt so customers can see what they tipped. Defaults to 0. */
  tipCents?: number;
  currency: string;
  /** Where Stripe redirects on success / cancel. The provider may append
   *  query params (e.g. session_id) — both URLs end up in the user's browser. */
  successUrl: string;
  cancelUrl: string;
  /** Free-form description shown on the Stripe-hosted checkout page. */
  productName: string;
  /** Optional client email — pre-fills the receipt-to address. */
  customerEmail?: string;
  /** Stored on the session so the webhook handler can correlate back to our row. */
  metadata: Record<string, string>;
}

export interface CreateCheckoutSessionResult {
  providerSessionId: string;
  url: string;
}

export interface RefundArgs {
  /** The provider's payment-intent id (or session id when intent isn't yet
   *  known — Stripe is happy with either for refunds). */
  providerPaymentId: string;
  /** Optional partial-refund amount. Omit for a full refund. */
  amountCents?: number;
  /** Idempotency key — typically a uuid scoped to one refund attempt. */
  idempotencyKey: string;
}

export interface RefundResult {
  providerRefundId: string;
  /** Stripe-reported refund status: succeeded / pending / failed. */
  status: "succeeded" | "pending" | "failed" | "canceled" | "requires_action";
  amountCents: number;
}

export interface ParsedWebhookEvent {
  /** Provider's stable event id — used for `processed_webhook_events` dedup. */
  id: string;
  type: string;
  /** The raw event payload — handlers narrow by `type`. */
  data: unknown;
}

/**
 * Pluggable payment provider. Implementations:
 *  - DevPaymentProvider: returns a synthetic URL + sid prefixed `dev_`,
 *    never reaches the network. Webhook verification is a no-op so a curl
 *    can simulate Stripe events locally.
 *  - StripePaymentProvider: official Stripe SDK for create-session and
 *    `Webhook.constructEvent` for HMAC-SHA256 signature verification on
 *    inbound events.
 *
 * `verifyAndParseWebhook` throws on a bad signature so the controller can
 * return 400 without leaking which check failed.
 */
export interface PaymentProvider {
  createCheckoutSession(
    args: CreateCheckoutSessionArgs,
  ): Promise<CreateCheckoutSessionResult>;
  refundPayment(args: RefundArgs): Promise<RefundResult>;
  verifyAndParseWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent;
}
