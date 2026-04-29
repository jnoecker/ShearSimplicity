export const PAYMENT_PROVIDER = Symbol("PaymentProvider");

export interface CreateCheckoutSessionArgs {
  /** Our internal Payment.id; passed to the provider as their idempotency key. */
  idempotencyKey: string;
  amountCents: number;
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
  verifyAndParseWebhook(rawBody: Buffer, signature: string): ParsedWebhookEvent;
}
