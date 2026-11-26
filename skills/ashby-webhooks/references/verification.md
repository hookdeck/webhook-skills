# Ashby Signature Verification

## How It Works

Ashby signs each webhook request with an HMAC-SHA256 digest of the **raw request
body** (the whole JSON string, exactly as sent, before any parsing), keyed on the
**secret token** you configured for that webhook. The digest is hex-encoded and
sent in the `Ashby-Signature` header with a `sha256=` prefix:

```
Ashby-Signature: sha256=f3124911d2956f10aa3a49c43a88bdf13bba846e94f0ae2bd7c034f90239bd04
```

The `sha256=` prefix indicates which algorithm produced the hash. To verify,
compute the HMAC-SHA256 of the raw body with your secret, hex-encode it, prefix
it with `sha256=`, and compare it to the header using a timing-safe comparison.

This is a **custom HMAC scheme** — it is **not** Standard Webhooks / Svix. There
are no `webhook-id`, `webhook-timestamp`, or `webhook-signature` headers, and no
timestamp is included in the signed content.

## No Official SDK

Ashby does not provide a webhook verification SDK, so verify manually in every
language/framework.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyAshbyWebhook(rawBody, signatureHeader, secret) {
  // Header format: "sha256=<hex>"
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody) // raw body: Buffer (Express) or string (Next.js)
    .digest('hex');

  // Timing-safe compare; catch length mismatch on malformed input
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
```

### Python (FastAPI)

```python
import hmac
import hashlib

def verify_ashby_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    # Header format: "sha256=<hex>"
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body.** HMAC must run over the exact bytes Ashby sent. If you
  parse JSON and re-serialize, key order and whitespace change and the digest
  will not match. In Express use `express.raw({ type: 'application/json' })`; in
  Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Hex, not base64.** The digest is hex-encoded. Comparing against a base64
  string always fails.
- **Strip the `sha256=` prefix** before comparing (or add it to your computed
  digest before comparing whole strings — but comparing the hex parts is
  cleaner).
- **Header name casing.** HTTP headers are case-insensitive; most frameworks
  lowercase them (`ashby-signature`). Read it accordingly.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  not `===` / `==`, to avoid timing attacks. Guard against length mismatches so a
  malformed header returns `false` instead of throwing.
- **Do not trust the `Ashby-Webhook` user agent** as authentication — anyone can
  send that header. Only the signature proves authenticity.
- **Return `2xx` on success.** Ashby retries other failures, up to 10
  attempts, but never retries `401`, `403`, `404`, `405` or `410`.

## Rejecting with 401

The examples in this skill return `401` when the signature does not verify.
Ashby's [retry docs](https://developers.ashbyhq.com/docs/retries) list `401` as
non-retryable, so a delivery rejected because of a wrong secret is not sent
again. Alert on verification failures (log at error level and notify on the
first occurrence), and after any secret change check that the `ping` Ashby
sends on save succeeded: if it fails, Ashby saves the webhook disabled.

## Debugging Verification Failures

- **Always fails:** You are likely verifying a parsed/re-serialized body instead
  of the raw bytes. Log the raw body length and the first characters and confirm
  they match what Ashby sent.
- **Works locally, fails in prod:** A proxy or body parser may be consuming/
  rewriting the body before your handler. Ensure the raw body reaches the
  verifier untouched.
- **Wrong secret:** Confirm `ASHBY_WEBHOOK_SECRET` matches the secret token set
  on the webhook in **Admin → Integrations → Webhooks**. If multiple webhooks hit
  one endpoint, they must share the same secret.
