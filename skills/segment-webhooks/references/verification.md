# How to Verify Segment Webhook Signatures

## How Does Segment Sign Webhooks?

Signing is optional and only happens when a **Shared Secret** is set on the destination.

| Item | Value |
|------|-------|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA1 keyed with the shared secret |
| Encoding | Lowercase hex (40 characters), no prefix |
| Signed content | The JSON request body (for a batch: **only the first event**, see below) |
| Timestamp / replay protection | None |
| Standard Webhooks | No |
| SDK | None: verify manually with your language's crypto library |

In Segment's Actions implementation the digest is `createHmac('sha1', sharedSecret).update(JSON.stringify(data), 'utf8').digest('hex')`, and the body is the same `JSON.stringify(data)`, so for a single event the signature equals the HMAC of the **raw body**.

## What About Batched Deliveries? (Important)

When **Enable Batching?** is on, the body is a JSON array of events, but **Segment signs only the first event in the batch, not the whole batch body**. Segment's docs: "If you have batching enabled and are using a shared secret to authenticate your requests, Segment signs the first event in the batch rather than the whole batch."

Consequences:

- A raw-body HMAC check **fails for every batched delivery**.
- To verify, compute the HMAC over the serialized first element: `JSON.stringify(body[0])` in Node, or the exact bytes of the first element sliced from the raw body (more robust than re-serializing in non-JS languages).
- **Only the first event is authenticated.** Events after it are not covered by the signature. If that matters, keep batching off.
- Tools that verify the raw body (including a Hookdeck source verifying `X-Signature` over the body) will reject batched Segment deliveries. Disable batching on the mapping when a raw-body verifier sits in front of your app.

## Implementation

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifySegmentSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const matches = (content) => {
    const expected = crypto.createHmac('sha1', secret).update(content, 'utf8').digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // different lengths
    }
  };

  // Single event: the signature covers the raw body
  if (matches(rawBody)) return true;

  // Batch: Segment signs only JSON.stringify(batch[0])
  try {
    const parsed = JSON.parse(rawBody);
    return Array.isArray(parsed) && parsed.length > 0 && matches(JSON.stringify(parsed[0]));
  } catch {
    return false;
  }
}
```

`JSON.stringify(JSON.parse(x)[0])` reproduces Segment's bytes because the body itself was produced by `JSON.stringify`.

### Python (FastAPI)

Python's `json.dumps` formats numbers and Unicode differently from `JSON.stringify`, so slice the first element's exact text out of the raw body instead of re-serializing:

```python
import hashlib, hmac, json, re
from typing import Optional

def _matches(content: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), content, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature, expected)

def first_batch_item(raw_body: bytes) -> Optional[bytes]:
    text = raw_body.decode("utf-8")
    m = re.match(r"\s*\[\s*", text)
    if not m or text[m.end():m.end() + 1] == "]":
        return None
    _, end = json.JSONDecoder().raw_decode(text, m.end())
    return text[m.end():end].encode("utf-8")

def verify_segment_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    if not signature or not secret:
        return False
    if _matches(raw_body, signature, secret):
        return True
    try:
        first = first_batch_item(raw_body)
    except ValueError:
        return False
    return first is not None and _matches(first, signature, secret)
```

## Common Gotchas

- **Batching:** the most common cause of "valid secret, every request fails". See above.
- **Raw body:** don't verify `JSON.stringify(req.body)` after a JSON body parser in Express. Use `express.raw()`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **SHA1, not SHA256:** Segment uses HMAC-SHA1. A SHA-256 digest is 64 hex chars and will never match.
- **No prefix:** the header is bare hex, not `sha1=...`.
- **Optional signing:** no `X-Signature` header means no Shared Secret is configured on that destination. Fail closed if you expect signed traffic.
- **Body rewriting:** a proxy or transformation that reformats JSON (whitespace, key order) breaks the signature. Verify before any transformation.
- **No timestamp:** there is no replay protection; de-duplicate with `messageId`.

## How Do I Debug Verification Failures?

1. Confirm the header arrives: log `x-signature` (header names are case-insensitive; Node and FastAPI lowercase them).
2. Check the secret: compare a hash of `SEGMENT_SHARED_SECRET` with what you typed in **Advanced Settings** (watch for trailing whitespace/newlines).
3. Check whether the body starts with `[`. If so it is a batch: verify against the first element, or turn batching off.
4. Recompute by hand:

   ```bash
   printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SEGMENT_SHARED_SECRET"
   ```
