# How to Verify GoCardless Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone could POST fake events to it. GoCardless
signs every webhook so you can prove the request genuinely came from GoCardless (and
wasn't tampered with) before you act on payment or mandate events.

## How It Works

GoCardless computes an **HMAC-SHA256** over the **raw request body** using your
**webhook endpoint secret**, hex-encodes it, and sends it in the `Webhook-Signature`
header:

```
Webhook-Signature: 1c1b3a...  (lowercase hex)
```

To verify, you recompute the HMAC over the raw body with the same secret and compare
it to the header using a **timing-safe** equality check.

| Property | Value |
|----------|-------|
| Header | `Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | Raw request body (exact bytes) |
| Encoding | Lowercase hex |
| Secret | Webhook endpoint secret from the Dashboard |
| Comparison | Timing-safe (`crypto.timingSafeEqual` / `hmac.compare_digest`) |

> GoCardless's [webhooks reference](https://docs.gocardless.com/docs/api-reference/webhooks)
> documents this scheme: an HMAC SHA256 hex digest of the raw request body, keyed
> with the webhook endpoint secret. It was also checked against a live sandbox
> delivery and the `gocardless-nodejs` SDK's own construction
> (`crypto.createHmac('sha256', secret).update(body).digest()` +
> `timingSafeEqual`) in 2026-08.

## Implementation

### SDK Verification (Node.js — preferred)

The official `gocardless-nodejs` SDK exposes `webhooks.parse()`, which verifies the
signature (timing-safe) and returns the parsed events array. It throws
`InvalidSignatureError` when the signature doesn't match.

```javascript
const { parse, InvalidSignatureError } = require('gocardless-nodejs/webhooks');

try {
  // body MUST be the raw request body (Buffer or string), not parsed JSON
  const events = parse(
    rawBody,
    process.env.GOCARDLESS_WEBHOOK_SECRET,
    signatureHeader // req.headers['webhook-signature']
  );
  // events is an array — process each one
} catch (err) {
  if (err instanceof InvalidSignatureError) {
    // reject: signature did not match
  }
  throw err;
}
```

`parse(body, webhookSecret, signatureHeader)` — note the parameter order: **body,
then secret, then signature header**. Use `parseWithMeta()` instead if you also want
the `webhookId` from the payload's `meta` field.

### Manual Verification (fallback — e.g. Python/FastAPI)

GoCardless's client libraries for Python, Ruby, PHP, Java, .NET and Go also parse and
verify webhooks (for example `gocardless_pro.webhooks.parse(body, secret, signature)`
in Python). Without a library, verify manually. The algorithm is straightforward:

```python
import hmac
import hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,           # raw bytes, not re-serialized JSON
        hashlib.sha256,
    ).hexdigest()
    # timing-safe comparison
    return hmac.compare_digest(expected, signature_header or "")
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** If you parse JSON and re-serialize it, key
  order and whitespace change, the bytes differ, and the HMAC won't match. Read the
  body as raw bytes/Buffer/string *before* verifying.
  - Express: `express.raw({ type: 'application/json' })`
  - Next.js App Router: `await req.text()`
  - FastAPI: `await request.body()`
- **Header name casing.** The header is `Webhook-Signature`. HTTP headers are
  case-insensitive; most frameworks lower-case them (`webhook-signature`).
- **Hex, not base64.** The signature is hex-encoded. Don't base64-decode it.
- **Use the secret verbatim — do NOT base64-decode the KEY.** The endpoint secret
  looks base64url-ish (e.g. contains `-` and `_`), which tempts a base64 decode
  before HMAC-ing. Don't: the key is the raw UTF-8 string. Base64-decoding it
  produces a non-matching signature (verified — decoding the public test vector's
  secret yields the wrong digest).
- **Header format.** `Webhook-Signature` carries a bare 64-char lowercase hex
  digest — no `X-` prefix and no `sha256=` scheme prefix.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest`
  (Python), not `==`. Guard against length mismatches (they raise/throw) by treating
  any exception as "invalid".
- **Batches.** The body has an `events` array (up to 250 events). Verify once over the
  whole body, then iterate the events.
- **Idempotency.** Delivery is at-least-once: GoCardless retries failed webhooks,
  the same event can appear in more than one webhook, and anyone can retry a webhook
  from the Dashboard. Dedupe on `event.id` to avoid double-processing.

## Response Codes

| Situation | Status |
|-----------|--------|
| Signature valid, batch accepted | `204 No Content` |
| Signature invalid or missing | `498 Invalid Token` (GoCardless's documented value) |
| Malformed body / unexpected error | `400` / `500` |

GoCardless's documentation uses `204` for success and `498 Invalid Token` for a failed
signature check, which GoCardless logs and doesn't retry. Any other non-2xx, or no
response within 10 seconds, is retried (9 attempts in all; see setup.md). Return
`204` promptly and process asynchronously.

## Debugging Verification Failures

- **Always fails:** You're verifying against a re-serialized body. Capture the raw
  bytes and HMAC those exact bytes.
- **Wrong secret:** Confirm `GOCARDLESS_WEBHOOK_SECRET` matches the endpoint's secret
  in the Dashboard, and that you're using the right environment (Sandbox vs Live).
- **Length mismatch throws:** Wrap `timingSafeEqual` in try/catch and return "invalid"
  on any error, or check buffer lengths first.
