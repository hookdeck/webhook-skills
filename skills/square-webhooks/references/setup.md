# Setting Up Square Webhooks

## Prerequisites

- A [Square account](https://squareup.com/) and access to the
  [Square Developer Console](https://developer.squareup.com/apps)
- A Square application (create one in the Developer Console)
- Your application's HTTPS webhook endpoint URL (the **notification URL**)

## Register Your Webhook Subscription

1. Sign in to the [Square Developer Console](https://developer.squareup.com/apps)
   and open your application.
2. In the left navigation, choose **Webhooks → Subscriptions**.
3. Select the environment tab — **Sandbox** for testing or **Production** for
   live traffic. Each environment has its own subscriptions and signature key.
4. Click **Add Subscription**.
5. Enter a **Name** and your **Notification URL** — the HTTPS endpoint that will
   receive events (e.g. `https://your-app.com/webhooks/square`). This exact URL
   is part of the signature, so it must match what your app uses to verify.
6. Choose the **API version** and select the **event types** to subscribe to
   (e.g. `payment.created`, `payment.updated`, `refund.created`,
   `invoice.payment_made`, `order.updated`).
7. Click **Save**.

## Get Your Signature Key

1. In **Webhooks → Subscriptions**, open the subscription you created.
2. Copy the **Signature Key** shown for that subscription.
3. Store it as `SQUARE_WEBHOOK_SIGNATURE_KEY` in your environment. Store the
   notification URL as `SQUARE_WEBHOOK_URL`.

```bash
SQUARE_WEBHOOK_SIGNATURE_KEY=your_signature_key
SQUARE_WEBHOOK_URL=https://your-app.com/webhooks/square
```

> Each subscription has its **own** signature key. If you have separate Sandbox
> and Production subscriptions, use the matching key and URL for each.

## Test Mode vs Live Mode

- **Sandbox** — Use the Sandbox environment and its signature key while
  developing. Square's Developer Console includes a **Send Test Event** button
  on each subscription to deliver a sample payload to your notification URL.
- **Production** — Switch to the Production subscription and its signature key
  when going live. Production webhook requests originate from Square's IP
  addresses `54.245.1.154` and `34.202.99.168` (Sandbox uses `54.212.177.79`
  and `107.20.218.8`) if you want to add an optional IP allowlist.

## Local Development

Square requires a public HTTPS notification URL, so use a tunnel to receive
events on your machine:

```bash
npx hookdeck-cli listen 3000 square --path /webhooks/square
```

Register the tunnel's public URL as your subscription's notification URL and set
`SQUARE_WEBHOOK_URL` to that same URL — because the URL is part of the signed
content, a mismatch causes signature verification to fail.
