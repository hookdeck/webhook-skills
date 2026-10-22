# How to Verify Confluence Data Center Webhook Signatures

## How It Works

When a secret is defined, Confluence signs each request with an HMAC (default HMACSha256) and sends it in the `X-Hub-Signature` header. The receiver computes the same HMAC over the received body, using the secret as key, and compares.

**Where the format comes from:** the Confluence page says the header "contains the HMAC" but doesn't show the value. The identically worded Bitbucket Data Center page shows `x-hub-signature: sha256=<hex>`, so this skill uses that format. Accept the digest with or without the `sha256=` prefix; reject any other algorithm prefix.

- Signed content: the raw request body, unmodified
- Algorithm: HMAC-SHA256, hex digest
- No timestamp is signed and there is no delivery ID header, so make handlers idempotent

## Implementation

No official SDK is provided for verification, so all three examples verify manually. See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/), [examples/fastapi/](../examples/fastapi/).

```python
import hashlib, hmac

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    sig = (header or "").strip().lower()
    algo, sep, rest = sig.partition("=")
    if sep:
        if algo != "sha256":
            return False
        sig = rest
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.encode(), expected.encode())
```

## Common Gotchas

- **Raw body:** parsing and re-serializing JSON changes the bytes. In Express use `express.raw({ type: '*/*' })`; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **No secret, no signature:** if the webhook has no secret, there is no header. Your receiver should require a secret and reject unsigned requests.
- **Prefix:** the header may be `sha256=<hex>`; compare the hex part.
- **Timing-safe compare:** handle length mismatches (`timingSafeEqual` throws) as invalid.
- **Cloud is different:** Confluence Cloud app webhooks use JWTs, not this header.

## Debugging Verification Failures

- Confirm the secret in your env matches the webhook's secret exactly (whitespace included).
- Log the raw body length and compare with the `Content-Length` header; a mismatch means a proxy or middleware altered it.
- Check that a reverse proxy or body parser isn't re-encoding the payload.
