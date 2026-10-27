# How to Verify Lob Webhook Signatures

## How It Works

Lob signs each delivery and sends two headers:

| Header | Value |
|--------|-------|
| `Lob-Signature` | Lowercase hex HMAC-SHA256 digest, bare (no prefix) |
| `Lob-Signature-Timestamp` | Timestamp included in the signed input |

Signed input (as bytes): `Lob-Signature-Timestamp` header value + `.` + raw request body.
Key: the webhook's secret from its dashboard details page, used as its UTF-8 bytes (not hex- or
base64-decoded). There is no Lob webhook SDK; verify manually. Lob's steps: (1) build the
signature input, (2) compute the HMAC-SHA256 as hex, (3) compare with `Lob-Signature`, (4)
optionally check the timestamp.

Events sent from Lob's webhook debugger are signed with a fixed test secret, so they fail verification. Real deliveries are signed with the webhook's secret.

## Implementation

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyLobSignature(rawBody, headers, secret) {
  const signature = headers['lob-signature'];
  const timestamp = headers['lob-signature-timestamp'];
  if (!secret || !signature || !timestamp) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'),
    Buffer.from('.', 'utf8'),
    rawBody, // Buffer from express.raw({ type: '*/*' }) or Buffer.from(await request.arrayBuffer())
  ]);
  const expected = crypto.createHmac('sha256', secret).update(message).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
```

### Manual Verification (Python)

```python
import hashlib, hmac, re

def verify_lob_signature(raw_body: bytes, signature, timestamp, secret) -> bool:
    if not secret or not signature or not timestamp:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    try:
        ts = timestamp.encode("latin-1")
    except UnicodeEncodeError:
        return False
    expected = hmac.new(secret.encode("utf-8"), b"".join([ts, b".", raw_body]), hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(signature.lower()))
```

Frameworks: Express `express.raw({ type: '*/*' })`; Next.js `await request.arrayBuffer()`; FastAPI `await request.body()`. See the runnable, tested versions in [examples/](../examples/).

## Optional Timestamp Tolerance

Lob's step 4 is optional and recommends rejecting timestamps older than 5 minutes. This skill
leaves it **off by default**: Hookdeck retries and replays re-send the original headers and
timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate
retries. The examples read `LOB_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off; `300` = 5
minutes). Lob does not document the timestamp unit, so the examples read a ~10-digit value as
seconds and a ~13-digit value as milliseconds, and reject a non-numeric timestamp when a
tolerance is set. The HMAC always covers the timestamp string exactly as received. Enable it only
when Lob calls your endpoint directly, and deduplicate on the event `id` otherwise.

## Common Gotchas

- **Debugger events fail.** They are signed with the literal secret `secret`, not the webhook's secret. Real deliveries pass.
- **Use the raw bytes.** Decoding the body to a string and re-encoding it, or `JSON.parse`/`JSON.stringify` before verifying, can change it. Parse only after the check passes.
- **Bare digest.** `Lob-Signature` has no `sha256=` prefix, and is a single value (no list or `v1,` splitting).
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so check for exactly 64 hex characters first. Hex is case-insensitive: lowercase (or decode) both sides before the constant-time compare.
- **Header values are used as received.** Do not trim, parse, or reformat `Lob-Signature-Timestamp`; build it into the message as latin1 bytes.
- **Python:** use `hmac.compare_digest` on bytes, not str.
- **Wrong secret.** Test and Live webhooks (and each webhook) have different secrets.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every debugger event fails | Debugger signs with `secret`; temporarily set `LOB_WEBHOOK_SECRET=secret` to test |
| Real deliveries fail | Wrong webhook's secret (Test vs Live), or the body was parsed/re-encoded before verification |
| Intermittent failures after enabling tolerance | Retries and replays carry the original timestamp; turn tolerance off or raise it |
| 401 on every request | Missing header (a proxy stripped it) or the signature has a prefix/whitespace added |
