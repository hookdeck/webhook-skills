# Setting Up Alipay (Antom) Webhooks

## Prerequisites

- An **Antom** merchant account with Dashboard access.
- Your application's public HTTPS webhook endpoint URL.
- An RSA key pair for your account (2048-bit). Antom supports self-generated
  keys or Dashboard-generated keys.

## Understand the Two Keys

Alipay's scheme is **asymmetric**, so there are two distinct keys — don't mix
them up:

| Key | Who holds it | Used for |
|-----|--------------|----------|
| **Your merchant private key** | You (secret) | Signing your API requests to Antom (not needed for notifications) |
| **Antom public key** | Provided in the Dashboard | **Verifying** the `Signature` on inbound notifications |

There is **no shared symmetric "webhook secret"** — verification uses Antom's
public key, not an HMAC secret.

## Get Your Keys

1. In the **Antom Dashboard**, go to **Developer > Key configuration** and click
   **Generate key** (or upload your own public key). The Antom public key is only
   available once you've done this.
2. Copy the **Antom public key** from **Developer > Quick start > Integration
   resources and tools > Integration resources**. This is what your webhook
   handler uses to verify inbound notification signatures.
3. Note your **Client ID** (looks like `SANDBOX_5YC47N2ZQHJ004124` in sandbox,
   or a production equivalent). It appears in the `Client-Id` header of every
   notification.

Store them as environment variables:

```bash
ALIPAY_CLIENT_ID=SANDBOX_5YC47N2ZQHJ004124
ALIPAY_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"  # Antom public key
```

> **PEM in `.env`:** store the PEM as a single line with literal `\n` between
> lines; the example code calls `.replace(/\\n/g, '\n')` to restore real
> newlines before use.

## Register Your Notify URL

You can set the notification URL **per API call**, or in the Dashboard:

- **Payments & captures** — pass `paymentNotifyUrl` in `pay()` or
  `createPaymentSession()`.
- **Refunds** — pass `refundNotifyUrl` in `refund()`.

```jsonc
// Example: pay() request body (excerpt)
{
  "paymentRequestId": "pay_20260724_0001",
  "paymentNotifyUrl": "https://your-app.com/webhooks/alipay",
  "paymentAmount": { "value": "8000", "currency": "USD" }
  // ...
}
```

The Dashboard's **Developer > Notification URL** sets a URL per notification
API. A per-call `paymentNotifyUrl` / `refundNotifyUrl` **takes precedence**.
`notifyAuthorization` and `notifyDispute` can only be set in the Dashboard. The
**Test** tab on the same page sends a simulated notification and shows whether
your acknowledgement passed.

## Test Mode vs Live Mode

- Use your **SANDBOX** Client ID and the sandbox base URL while integrating.
  Sandbox Client IDs are prefixed `SANDBOX_`.
- Test and live modes use **different keys**: copy the live Antom public key
  when you go to production.
- Trigger a real notification by creating a sandbox payment and completing it in
  the sandbox cashier; Antom will POST the notification to your `paymentNotifyUrl`.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 alipay --path /webhooks/alipay
```

Use the printed URL as your `paymentNotifyUrl` when creating a sandbox payment.

## Acknowledgement Requirements

Your endpoint must respond **HTTP 200** with the fixed `SUCCESS` body (see
[verification.md](verification.md)); no signature is needed. If it doesn't,
Antom resends the notification up to eight times within 24 hours (0s, 2m, 10m,
10m, 1h, 2h, 6h, 15h; one Antom page says seven). In the sandbox a wrong
acknowledgement isn't resent. Make processing **idempotent**: there's no
notification ID, so key on the type field plus the resource ID (`paymentId`,
`refundId`, `captureId`, `disputeId`).
