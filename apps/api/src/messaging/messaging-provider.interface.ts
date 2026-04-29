export const MESSAGING_PROVIDER = Symbol("MessagingProvider");

export interface SendSmsArgs {
  to: string;
  from: string;
  body: string;
}

export interface SendSmsResult {
  providerMessageId: string;
  /** Provider-reported status at the time the API call returned. The terminal
   *  state (DELIVERED / FAILED) usually arrives later via a status callback. */
  status: "QUEUED" | "SENT" | "DELIVERED" | "FAILED";
}

export interface ValidateInboundArgs {
  /** The header the provider used to sign the request (Twilio: X-Twilio-Signature). */
  signature: string;
  /** Full request URL the provider POSTed to, exactly as it was hit (no rewriting). */
  url: string;
  /** Form fields from the body, used to compute the expected HMAC. */
  params: Record<string, string>;
}

/**
 * Pluggable SMS delivery + inbound verification, mirroring the AuthProvider
 * pattern. Implementations:
 *  - DevMessagingProvider: never calls a real network — logs to the API log
 *    and returns a fake sid. Inbound signature check is a no-op so a curl can
 *    simulate Twilio webhooks locally.
 *  - TwilioMessagingProvider: real outbound via the Twilio REST API and real
 *    HMAC-SHA1 signature verification on inbound webhooks.
 *
 * Throws on send failure so the outbox worker can retry. Idempotency is the
 * worker's responsibility (it inserts a Message row keyed by outboxEventId
 * before this is called).
 */
export interface MessagingProvider {
  sendSms(args: SendSmsArgs): Promise<SendSmsResult>;
  validateInboundSignature(args: ValidateInboundArgs): boolean;
}
