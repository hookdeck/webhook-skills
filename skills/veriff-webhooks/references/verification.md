# How to Verify Veriff Webhook Signatures

## How Does Veriff Sign Webhooks?

| Property | Value |
|----------|-------|
| Header | `X-HMAC-SIGNATURE` (HTTP headers are case-insensitive) |
| Algorithm | HMAC-SHA256 |
| Signed content | The **raw request body**, exactly as sent |
| Key | Your integration's **shared secret key**, used as a plain UTF-8 string (no base64 or hex decoding, no prefix) |
| Encoding | Hex digest, lowercase |
| Timestamp / replay window | None. The signature covers only the body |
| Standard Webhooks | No |

Veriff also sends `X-AUTH-CLIENT` (your integration API key) and shows `vrf-integration-id` in its example headers. Neither proves the request came from Veriff. Their own docs say `X-HMAC-SIGNATURE` is the authenticating header.

Veriff offers no webhook-verification SDK, so the examples verify manually with the standard library.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyVeriff(rawBody, signatureHeader, sharedSecret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', sharedSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

In Express use `express.raw({ type: '*/*' })` on the route so `req.body` is a `Buffer`. In the Next.js App Router use `await request.text()`.

### Python

```python
import hmac, hashlib

def verify_veriff(raw_body: bytes, signature_header: str, shared_secret: str) -> bool:
    expected = hmac.new(shared_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower(), expected)
```

In FastAPI read `await request.body()` rather than declaring a Pydantic body parameter.

## Test Vector From Veriff's Docs

Veriff publishes a mock secret and a signed decision-webhook payload in the [Webhooks Guide](https://devdocs.veriff.com/docs/webhooks-guide) (Mock payload and shared secret key for local testing):

- Shared secret key: `abcdef12-abcd-abcd-abcd-abcdef012345`
- Payload: the docs' mock decision webhook, **compacted** (no whitespace between tokens)
- Expected `X-HMAC-SIGNATURE`: `01fa3ded011bfce75672c99877a6cc1cf7aeaeda0ccb6b43fc21b60f595063c2`

The docs' curl example is pretty-printed for readability and contains non-breaking spaces; the signature only matches the compact serialization. Each example's tests include this payload as `fixtures/docs-mock-payload.json` and assert the docs signature.

(Veriff's HMAC article has a second, separate vector for a `POST /sessions` API request signed with the same mock secret. That's for outgoing API calls, not webhooks.)

## Common Gotchas

- **Raw body.** Re-serializing parsed JSON changes whitespace and key order and breaks the signature. Veriff warns that some languages include hard spaces and others don't.
- **Signing the wrong thing.** The docs' own local-test server signs `JSON.stringify(req.body)`, which only works when the bytes happen to be identical. Sign the raw bytes.
- **Wrong key.** Use the shared secret key, not the API key (`X-AUTH-CLIENT`).
- **Case.** Veriff's reference validator lowercases both sides; do the same.
- **Body-parsing middleware.** A global `express.json()` ahead of your route consumes the body. Mount the raw parser on the webhook route.
- **Proxies.** A gateway or middleware that rewrites the body (re-compressing, pretty-printing) invalidates the signature.
- **Out-of-order and duplicate deliveries.** There is no timestamp to reject replays with, so make the handler idempotent.

## How Do I Debug Verification Failures?

1. In the Customer Portal open the session → **Webhooks** tab → the delivery → **Details**.
2. Copy the **Raw body** and compute the HMAC with your shared secret (for example with `openssl dgst -sha256 -hmac "$SECRET" -hex` on a file saved without a trailing newline).
3. Compare with the value under **Request headers** → `x-hmac-signature`.
4. If that matches but your server rejects it, the body your code hashes differs from what Veriff sent (parsed JSON, trailing newline, charset conversion), or the secret belongs to a different integration.
5. If it doesn't match, you are using the wrong key.
