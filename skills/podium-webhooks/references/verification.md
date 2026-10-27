# How to Verify Podium Webhook Signatures

## How It Works

When a webhook has a `secret`, Podium signs every delivery with it:

```
signed_payload = `${podium-timestamp}.${raw_request_body}`
signature      = HMAC_SHA256(secret, signed_payload)   // hex
```

| Item | Value |
|------|-------|
| Signature header | `podium-signature`: bare lowercase hex digest (64 chars), no prefix |
| Timestamp header | `podium-timestamp`: Unix **milliseconds**, e.g. `1620936594591` |
| Algorithm | HMAC-SHA256 |
| Key | The `secret` as UTF-8 bytes, used as-is |

Podium's text never names the encoding. Its examples show a 64-character lowercase hex
`podium-signature`, which is what Hookdeck checks. Webhooks without a secret are not signed and
cannot pass verification.

## Implementation

Podium has no webhook SDK, so verification is manual. Build the message as **bytes**:

1. The `podium-timestamp` header string, encoded latin1 (`Buffer.from(v, 'latin1')`, `v.encode('latin-1')`). Never trim or reformat it.
2. A literal `.` (UTF-8).
3. The raw body bytes as received, concatenated (`Buffer.concat`, `b"".join`). Never decode and re-encode the body.

### Node.js

```javascript
const crypto = require('crypto');

function verifyPodium(rawBody, signature, timestamp, secret) {
  if (!secret || !signature || !timestamp) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet first
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

### Python

```python
def verify_podium(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
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

Podium's docs don't require a freshness check, and the examples **do not** reject old timestamps by
default: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself
applies no tolerance, so a fixed window would reject legitimate retries. To opt in, set
`PODIUM_WEBHOOK_TOLERANCE_SECONDS=300` (unset or `0` = off). The header is in milliseconds, so the
examples compare `|Date.now() - ts|` against `tolerance * 1000`. The check runs after the signature
check and answers `401`. Prefer idempotency on your own key.

## Common Gotchas

- **Raw body.** The signed content is the exact request body. Re-serialising can change key order, spacing and escapes. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **No secret, no signature.** A webhook created without a secret sends no `podium-signature`, so every delivery fails verification.
- **Milliseconds.** `podium-timestamp` is Unix milliseconds, not seconds; mind it if you add a tolerance.
- **Secret encoding.** Use the secret as plain text. Hex- or base64-decoding it fails every check.
- **`timingSafeEqual` throws on unequal lengths** and `Buffer.from(sig, 'hex')` silently drops bad characters, so validate length and alphabet before decoding.
- **Methods.** The method isn't documented; accept GET, POST, PUT, PATCH and DELETE, verify first, and treat a missing body as empty bytes.
- **5-second timeout.** Respond fast; do the work asynchronously.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request `401`, no `podium-signature` header | The webhook was created without a secret |
| Every request `401` with the header present | Wrong secret, or body parsed before verifying |
| `401` only on some payloads | Body re-serialised or decoded to a string and re-encoded |
| `401` after a retry or replay | You enabled the tolerance window; the original timestamp is old |
| `500` | `PODIUM_WEBHOOK_SECRET` not set |
| Source in Hookdeck rejects, endpoint works | Wrong secret, no secret on the Podium webhook, or the method isn't allowed on the source |
