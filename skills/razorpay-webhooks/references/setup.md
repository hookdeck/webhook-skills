# Setting Up Razorpay Webhooks

## Prerequisites

- A Razorpay account (with dashboard access to create webhooks)
- Your application's public webhook endpoint URL (must use **port 80 or 443**)

## Create the Webhook and Choose a Secret

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Go to **Settings → Webhooks** (Account & Settings → Webhooks).
3. Click **+ Add New Webhook**.
4. Enter your **Webhook URL**, e.g. `https://your-app.com/webhooks/razorpay`.
5. Enter a **Secret**. This is a value **you choose** — Razorpay uses it to sign
   each request with HMAC-SHA256. Store the same value in your app as
   `RAZORPAY_WEBHOOK_SECRET`. It is **separate** from your API Key ID/Secret.
6. Under **Active Events**, select the events you want to receive, for example:
   - `payment.authorized`
   - `payment.captured`
   - `payment.failed`
   - `order.paid`
   - `refund.processed`
   - `subscription.charged`
7. Click **Create Webhook**.

You can configure **separate webhooks for Live mode and Test mode** — switch
modes with the toggle in the dashboard. Each mode has its own webhook (and its
own secret).

## Get / Rotate the Secret

The secret is the value you entered when creating the webhook. If you rotate it,
update `RAZORPAY_WEBHOOK_SECRET` in your app. During rotation, Razorpay retries
older undelivered requests with the **old** secret, so keep the previous secret
available until retries drain.

## IP Allowlisting (Optional but Recommended)

Razorpay sends webhooks from a fixed set of IP addresses. If your server or
firewall restricts inbound traffic, allowlist the Razorpay webhook IPs listed in
the [Razorpay security docs](https://razorpay.com/docs/webhooks/). IP
allowlisting is a network-layer control **in addition to** signature
verification — it is not a replacement for verifying `X-Razorpay-Signature`.

## Test Mode vs Live Mode

- **Test mode:** Use test API keys and Razorpay's test flows to trigger events
  (e.g. simulate a test payment). The Test-mode webhook fires with its own
  secret.
- **Live mode:** Real transactions trigger real events against the Live-mode
  webhook and secret.

Always verify the signature in both modes — the algorithm is identical.

## Verify Delivery

After creating the webhook, trigger a test event (e.g. a test-mode payment) and
confirm your endpoint returns **HTTP 2xx**. Razorpay retries deliveries that do
not receive a `2xx` response, so make your handler idempotent (see the
[webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
idempotency reference).
