import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { env } from "../env";
import type {
  CreateCheckoutSessionArgs,
  CreateCheckoutSessionResult,
  ParsedWebhookEvent,
  PaymentProvider,
} from "./payment-provider.interface";

/**
 * Local-development payment provider. Logs every checkout attempt and
 * returns a synthetic session sid prefixed `dev_cs_` so it never collides
 * with a real Stripe session id (`cs_test_...`).
 *
 * The "checkout URL" we hand back is a self-routed URL that the dev web
 * app can intercept to simulate a successful payment without leaving the
 * loopback — flows back through the same webhook path we'd use in
 * production.
 *
 * Webhook signature verification is a no-op — local testing simulates
 * Stripe webhooks via curl, which can't sign with the production secret.
 * Refuses to run when NODE_ENV=production so this can't accidentally ship.
 */
@Injectable()
export class DevPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(DevPaymentProvider.name);

  async createCheckoutSession(
    args: CreateCheckoutSessionArgs,
  ): Promise<CreateCheckoutSessionResult> {
    if (env.NODE_ENV === "production") {
      throw new Error("DevPaymentProvider must not run in production");
    }
    const sid = `dev_cs_${randomUUID()}`;
    this.logger.log(
      `[dev-checkout] sid=${sid} amount=${args.amountCents} ${args.currency} product=${JSON.stringify(args.productName)} success=${args.successUrl}`,
    );
    // The dev URL points at the simulator at apps/web/src/app/dev/checkout.
    // We embed the success / cancel URLs so the simulator can finish the
    // flow with a real redirect — `{CHECKOUT_SESSION_ID}` substitution
    // happens in the simulator, mirroring what Stripe does in production.
    const params = new URLSearchParams({
      sid,
      amount: String(args.amountCents),
      currency: args.currency,
      product: args.productName,
      success: args.successUrl,
      cancel: args.cancelUrl,
    });
    const url = `${env.WEB_ORIGIN}/dev/checkout?${params.toString()}`;
    return { providerSessionId: sid, url };
  }

  verifyAndParseWebhook(rawBody: Buffer, _signature: string): ParsedWebhookEvent {
    if (env.NODE_ENV === "production") {
      throw new Error("DevPaymentProvider must not run in production");
    }
    // The dev webhook accepts whatever JSON you send and trusts the body.
    // Useful for curl-driven local testing of the handler logic.
    const parsed = JSON.parse(rawBody.toString("utf8")) as {
      id?: string;
      type?: string;
      data?: unknown;
    };
    if (!parsed.id || !parsed.type) {
      throw new Error("Dev webhook body must include `id` and `type`");
    }
    return { id: parsed.id, type: parsed.type, data: parsed.data ?? {} };
  }
}
