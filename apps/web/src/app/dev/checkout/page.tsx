import { notFound } from "next/navigation";
import { completeDevCheckoutAction } from "./_actions";

/**
 * Dev-only Stripe Checkout simulator. The DevPaymentProvider points its
 * `url` here instead of stripe.com — the page renders a stand-in
 * "checkout" with two buttons:
 *
 *   - Confirm payment → server action POSTs a synthetic
 *     `checkout.session.completed` to our /webhooks/stripe, then
 *     redirects to the success URL with `{CHECKOUT_SESSION_ID}` filled
 *     in (mirrors what Stripe does in prod).
 *   - Cancel → redirect straight to the cancel URL.
 *
 * 404s in production so it can't be hit even if PAYMENT_PROVIDER is
 * mistakenly set to `dev` there.
 */
export default async function DevCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    sid?: string;
    amount?: string;
    currency?: string;
    product?: string;
    success?: string;
    cancel?: string;
  }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const params = await searchParams;
  const sid = params.sid;
  const amountCents = Number(params.amount ?? 0);
  const currency = (params.currency ?? "USD").toUpperCase();
  const product = params.product ?? "Appointment";
  const success = params.success ?? "";
  const cancel = params.cancel ?? "";

  if (!sid || !success || !cancel || !Number.isFinite(amountCents)) {
    notFound();
  }

  const formattedAmount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountCents / 100);

  return (
    <main className="ss-dev-checkout">
      <div className="ss-dev-checkout-card">
        <div className="ss-page-eyebrow">Dev payment simulator</div>
        <h1 className="ss-dev-checkout-title">{product}</h1>
        <div className="ss-dev-checkout-amount">{formattedAmount}</div>
        <p className="ss-dev-checkout-meta">
          Session id <code>{sid}</code>
        </p>
        <p className="ss-dev-checkout-note">
          This page stands in for the Stripe-hosted checkout while
          PAYMENT_PROVIDER=dev. Confirming POSTs a synthetic
          <code> checkout.session.completed</code> event to{" "}
          <code>/webhooks/stripe</code>, just like the real provider would.
        </p>

        <form action={completeDevCheckoutAction} className="ss-dev-checkout-actions">
          <input type="hidden" name="sid" value={sid} />
          <input type="hidden" name="amount" value={amountCents} />
          <input type="hidden" name="currency" value={currency} />
          <input type="hidden" name="success" value={success} />
          <button type="submit" className="ss-btn ss-btn-primary">
            Confirm payment
          </button>
          <a className="ss-btn ss-btn-ghost" href={cancel}>
            Cancel
          </a>
        </form>
      </div>
    </main>
  );
}
