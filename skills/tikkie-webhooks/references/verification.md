# Tikkie Notification Verification

## There is no signature

The notification callbacks in the official Tikkie API v2.3 OpenAPI spec
(`TikkieAPI_v2.3.yaml`) define only:

- a JSON request body (`subscriptionId`, `notificationType`, and tokens), and
- a `2XX` response: "Acknowledgement that a notification is received."

The spec has none of the following:

- a signature header
- a shared secret or signing key
- HMAC, or any digest over the body
- a timestamp header or replay window
- an asymmetric signature (RSA/ECDSA/Ed25519)
- a published source-IP allowlist

**Any `crypto.createHmac`, `hmac.new` or `crypto.verify` over a Tikkie body is
fabricated.** It will either reject every real notification or pretend to check
something that isn't there. Since there's no signature, you don't need the raw
body either. A normal JSON parser is fine.

## What to do instead

These are mitigations. None of them proves that Tikkie sent the request.

### 1. Check `subscriptionId` (weak)

Every notification includes the `subscriptionId` that Tikkie returned (`201`)
when you subscribed. Store that id and reject mismatches with a `4xx` (the
examples use `403`). The payment-request and transactions subscriptions have
**different ids**, so allow both if they share a URL.

The check is weak because the id isn't a secret-grade credential. It's a UUID
that appears in every delivery, logs and proxies. It filters out noise and
misdirected traffic, but it won't stop a determined attacker.

The examples read `TIKKIE_SUBSCRIPTION_ID` (comma-separated). If it's unset, they
log a warning and **skip** the check rather than crash.

### 2. Re-fetch the authoritative record (the real control)

A notification carries only tokens, never amounts or status, so it can't tell
you what to fulfil. Treat it as a trigger and fetch the record with your
credentials:

| `notificationType` | Request |
|---|---|
| `PAYMENT` | `GET /paymentrequests/{paymentRequestToken}/payments/{paymentToken}` |
| `REFUND` | `GET /paymentrequests/{paymentRequestToken}/payments/{paymentToken}/refunds/{refundToken}` |
| `BUNDLE` | `GET /transactionbundles/{bundleId}` |

Every request uses the headers `API-Key: <consumer key>` and
`X-App-Token: <app token>`.

- **404:** the tokens don't exist for your app, so treat the notification as
  forged and reject it (the examples return `403`).
- **2xx:** act on the fetched `amountInCents` / `status`, not on the notification.
- **Other errors:** return `5xx` so Tikkie retries (up to three attempts), and
  rely on reconciliation polling as a backstop.

A forger would need valid tokens for **your** app to get past this step. Even
then, the most they can do is make you re-read a real record, which is harmless
if your handler is idempotent.

### 3. Hard-to-guess callback URL (optional)

You can register a URL with a random path segment, such as
`/webhooks/tikkie/3f9c…`. Tikkie doesn't document query-string secrets. The spec
only says `url` must be a valid URL (errors `URL_MISSING`, `URL_INVALID`,
`URL_DISALLOWED`). Treat the URL as confidential and don't log it in full.

## Common mistakes

| Mistake | Fix |
|---|---|
| Writing an HMAC verifier or looking for an `X-Signature` header | Tikkie sends none. Use the subscriptionId check plus a re-fetch |
| Fulfilling from the notification body | The body has no amount or status. Re-fetch |
| Branching on a header for the event type | Use the `notificationType` body field |
| Configuring only one subscriptionId when both subscriptions share a URL | Comma-separate both ids |
| Returning 4xx for an unknown `notificationType` | Log it and return 2xx |
| Calling the sandbox API for production notifications (or the reverse) | The re-fetch 404s. Match `TIKKIE_API_BASE_URL` to the environment |
| Confusing this with the Business Account Notification API or Tikkie v1 | Those are different products with different schemes |
