# Setting Up NMI Webhooks

## Prerequisites

- An NMI (Network Merchants) gateway account with access to the **Merchant
  Portal** (this also applies to NMI-powered white-label gateways)
- Your application's public webhook endpoint URL (HTTPS)

## 1. Open the Webhooks Settings

1. Sign in to the **Merchant Portal**.
2. Go to **Settings → Webhooks**.

## 2. Get Your Signing Key

1. On the **Webhooks** page, locate the **signing key** (labeled as your
   *webhooks signing key*).
2. Copy the signing key and store it as `NMI_SIGNING_KEY` in your app's
   environment.

> The signing key is what signs the `Webhook-Signature` header. It is **not** one
> of the API keys under Settings → Security Keys. NMI doesn't document rotation;
> if the key ever changes, update `NMI_SIGNING_KEY` at the same time or every
> delivery will fail verification.

## 3. Register Your Endpoint

1. On the same **Settings → Webhooks** page, click **Create** and enter your
   endpoint URL (e.g. `https://your-app.example.com/webhooks/nmi`). It must use
   `https` with valid TLS.
2. Select the events you want to receive. For transaction handling, the common
   choices are the `transaction.<action>.<result>` events — for example
   `transaction.sale.success`, `transaction.auth.success`,
   `transaction.capture.success`, `transaction.void.success`,
   `transaction.refund.success`.
3. Save. NMI starts POSTing events as soon as the URL is saved; there is no
   test request or further setup.

## 4. Verify Deliveries

Every POST includes a `Webhook-Signature: t=<nonce>,s=<signature>` header. Your
handler must:

1. Read the **raw body** (do not let a JSON parser touch it first).
2. Parse `t` (the nonce) and `s` (the signature) from the header.
3. Compute `HMAC-SHA256(signing_key, t + "." + raw_body)`, hex-encode it, and
   compare (timing-safe) to `s`.
4. Return **200** quickly. NMI retries any response other than HTTP 200, up to
   20 times over about 3 days.

Remember: NMI's sample calls **`t` a nonce**, and the docs document no age/replay
window to enforce. See [verification.md](verification.md) for the exact algorithm and
gotchas.

## Testing

NMI documents no test send or resend for webhooks. To exercise your handler:

1. Start a tunnel:
   `npx hookdeck-cli listen 3000 nmi --path /webhooks/nmi`
2. Register the printed tunnel URL as your endpoint under **Settings → Webhooks**.
3. Run a transaction (for example a sale you then void) and watch the delivery
   arrive. NMI's example payloads carry `features.is_test_mode` for test-mode
   transactions.

## Optional: IP Allowlisting

NMI delivers from published ranges (`104.192.32.81–104.192.32.87` and
`104.192.36.81–104.192.36.87`). Allowlisting these can be a defence-in-depth
layer, but the `Webhook-Signature` HMAC is the authoritative authenticity check —
never rely on IP alone.
