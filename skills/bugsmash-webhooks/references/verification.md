# How to Verify BugSmash Webhook Signatures

## How It Works

BugSmash signs every delivery with the webhook's `secret_key`:

```
signed_payload = `${X-Webhook-Timestamp}.${raw_request_body}`
signature      = HMAC_SHA256(secret_key, signed_payload)
```

| Item | Value |
|------|-------|
| Signature header | `X-BugSmash-Signature`: bare lowercase hex digest (64 chars), no prefix |
| Timestamp header | `X-Webhook-Timestamp`: Unix seconds. Generic name, not `X-BugSmash-...` |
| Algorithm | HMAC-SHA256 |
| Key | The `secret_key` as UTF-8 bytes, whole, including `bgsmsh_` |

## Implementation

BugSmash has no webhook SDK, so verification is manual. Build the message as **bytes**:

1. The `X-Webhook-Timestamp` header string, encoded latin1 (`Buffer.from(v, 'latin1')`, `v.encode('latin-1')`). Never trim or reformat it.
2. A literal `.` (UTF-8).
3. The raw body bytes as received, concatenated (`Buffer.concat`, `b"".join`). Never decode and re-encode the body.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBugsmash(rawBody, signature, timestamp, secret) {
  if (!secret || !signature || !timestamp) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet first
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
def verify_bugsmash(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not (secret and signature and timestamp) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(signature))
```

Hex is compared case-insensitively (as Hookdeck does): both sides are decoded to bytes. The whole
header value is one digest, with no list splitting or prefix parsing. Status codes: missing or empty
header, malformed value or mismatch is `401`; a missing secret is `500`.

## Replay Protection (Opt-in)

BugSmash suggests rejecting timestamps older than five minutes. The examples **do not** do this by
default: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself
applies no tolerance, so a fixed window would reject legitimate retries. To opt in, set
`BUGSMASH_WEBHOOK_TOLERANCE_SECONDS=300` (`X-Webhook-Timestamp` is Unix seconds; unset or `0` = off).
The check runs after the signature check and answers `401`. Prefer idempotency on your own key.

## Common Gotchas

- **Raw body.** BugSmash's Node sample signs `JSON.stringify(payload)` of the parsed body, but the same page says to sign the raw body. Re-serialising can change key order, spacing and escapes. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Secret prefix.** Use the secret whole, including `bgsmsh_`. Stripping it, or decoding it, fails every check.
- **Timestamp header name.** It is `X-Webhook-Timestamp`, and there is no `X-BugSmash-Timestamp`.
- **`timingSafeEqual` throws on unequal lengths** and `Buffer.from(sig, 'hex')` silently drops bad characters, so validate length and alphabet before decoding.
- **Methods.** The method isn't documented; accept GET, POST, PUT, PATCH and DELETE, verify first, and treat a missing body as empty bytes.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request `401` | Wrong or truncated secret (lost `bgsmsh_`?), or body parsed before verifying |
| `401` only on some payloads | Body re-serialised or decoded to a string and re-encoded |
| `401` after a retry or replay | You enabled the tolerance window; the original timestamp is old |
| `500` | `BUGSMASH_WEBHOOK_SECRET` not set |
| Source in Hookdeck rejects, endpoint works | Secret pasted without the `bgsmsh_` prefix, or the method isn't allowed on the source |
