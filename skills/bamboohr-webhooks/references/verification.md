# How to Verify BambooHR Webhook Signatures

## How Does BambooHR Signature Verification Work?

- Headers: `X-BambooHR-Signature` and `X-BambooHR-Timestamp`
- Algorithm: HMAC-SHA256
- Key: the webhook's private key, as a UTF-8 string
- Signed content: the **raw request body bytes**, then the **`X-BambooHR-Timestamp` value**, concatenated with **no separator**
- Signature encoding: lowercase hex, 64 characters, no prefix

The same scheme applies to Event-Based and Field-Based webhooks: BambooHR documents a single signing scheme on its main Webhooks page, the Permissioned guide (which Event-Based webhooks sit under) points back to it, and the Create Webhook response returns a `privateKey` for HMAC-SHA256 verification whichever events you pick.

BambooHR's own PHP sample is `hash_hmac('SHA256', $data . $timestamp, $privateKey)` with `$data` the raw body. There is no official SDK helper, so all examples verify manually.

## Node.js

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, timestamp, privateKey) {
  if (!signature || !timestamp || !privateKey) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const message = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', privateKey).update(message).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

With Express use `express.raw({ type: '*/*' })` so `req.body` is the exact Buffer for any content type (JSON or form).

## Next.js (App Router)

```typescript
const rawBody = Buffer.from(await request.arrayBuffer());
```

Pass `rawBody` to the same function. Do not use `request.json()` or `request.text()` first.

## Python (FastAPI)

```python
import hashlib, hmac, re

def verify_signature(raw_body: bytes, signature, timestamp, private_key) -> bool:
    if not signature or not timestamp or not private_key:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    message = b"".join([raw_body, timestamp.encode("latin-1")])
    expected = hmac.new(private_key.encode(), message, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

Use `raw_body = await request.body()`.

## Common Gotchas

- **Order matters**: body first, then timestamp. Putting the timestamp first (as in Stripe-style `t.body`) never matches.
- **No separator**: there is no `.` or other character between the body and the timestamp.
- **Raw bytes only**: do not decode and re-encode the body, and do not `JSON.parse`/`JSON.stringify` before verifying. Form-encoded webhooks sign the raw form body too.
- **Header value as sent**: use the `X-BambooHR-Timestamp` string exactly as received, without trimming or reformatting. Encode it latin1 (Node `Buffer.from(value, 'latin1')`, Python `value.encode('latin-1')`).
- **Key is a string**: the private key is used as its UTF-8 bytes, not hex- or base64-decoded.
- **Validate before decoding**: check the signature is exactly 64 hex characters. `Buffer.from(sig, 'hex')` silently drops invalid characters. Hex is case-insensitive, so lowercase before comparing.
- **Compare the whole header** as one digest: no list splitting, no prefix parsing.
- **Constant-time compare**: `crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on bytes.
- **Status codes**: respond `401` for missing, malformed or mismatched signatures. 4xx responses are not retried; 5xx are.

## Should I Reject Old Timestamps?

Not by default. BambooHR retries (up to 40 minutes later) and Hookdeck retries and replays resend the original `X-BambooHR-Timestamp`, so a fixed window would reject legitimate redeliveries. Hookdeck's own BambooHR source applies no tolerance. Use idempotency on `employees[].id` plus `timestamp` for replay protection instead.

If you want a window anyway, the examples support `BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). BambooHR does not document the header's format, so the examples parse it only when this is set, accepting epoch seconds or milliseconds, and reject a timestamp they can't parse. Check a real delivery before enabling it.

## Debugging Verification Failures

1. Log `len(raw_body)` and compare to the request's `Content-Length`; a mismatch means the body was altered or parsed first.
2. Confirm you are using the private key of the **same webhook** that sent the request (each webhook has its own).
3. For a Permissioned webhook, confirm you saved the `privateKey` from the create response; it is not shown again.
4. Print the computed digest and the header; a difference in only case is fine, anything else is a signed-content or key problem.
5. Behind a proxy or framework middleware, make sure nothing re-encodes or decompresses the body before your handler.
