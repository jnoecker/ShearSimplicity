"use server";

import "server-only";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";

/**
 * Simulates Stripe finishing a checkout session by POSTing a synthetic
 * `checkout.session.completed` event at our `/webhooks/stripe` endpoint.
 * The dev payment provider's `verifyAndParseWebhook` accepts any
 * `stripe-signature` value, so we don't need to sign anything.
 *
 * This route must only run in dev — it short-circuits the entire payment
 * flow and would be a critical security hole in production. Refuses to
 * proceed when NODE_ENV=production.
 */
export async function completeDevCheckoutAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev checkout simulator must not run in production");
  }
  const sid = String(formData.get("sid") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const currency = String(formData.get("currency") ?? "USD");
  const successUrl = String(formData.get("success") ?? "");
  if (!sid || !successUrl) {
    throw new Error("Missing sid / success URL in form data");
  }

  const event = {
    id: `evt_dev_${sid}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sid,
        // Synthetic payment_intent id so future refund flows can correlate.
        payment_intent: `pi_dev_${sid}`,
        payment_status: "paid",
        amount_total: amount,
        currency: currency.toLowerCase(),
      },
    },
  };

  const res = await fetch(`${serverEnv.apiInternalUrl}/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The dev provider's verifyAndParseWebhook ignores the signature value
      // — it just needs the header to be present so the controller doesn't
      // reject with "Missing Stripe-Signature".
      "stripe-signature": "dev",
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dev webhook POST failed: ${res.status} ${text}`);
  }

  // Stripe substitutes `{CHECKOUT_SESSION_ID}` in success_url with the
  // session id. Mirror that here so the success route can read it the
  // same way it would in production.
  const finalUrl = successUrl.replace(
    encodeURIComponent("{CHECKOUT_SESSION_ID}"),
    sid,
  ).replace("{CHECKOUT_SESSION_ID}", sid);
  redirect(finalUrl);
}
