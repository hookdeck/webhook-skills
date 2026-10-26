# How to Verify Onramper Webhook Signatures

## How It Works

- Header: `X-Onramper-Webhook-Signature`: the bare lowercase hex digest, no prefix. Compare the whole value as one digest; don't split or strip anything.
- Algorithm: HMAC-SHA256. The prose in Onramper's docs only says "HMAC hex digest"; SHA-256 comes from their TypeScript sample: `crypto.createHmac('sha256', secret).update(body).digest('hex')`.
- Signed content: the raw request body only. No timestamp, id or other header is signed, so there is no replay window to check. Don't invent one from unsigned fields.
- Key: the secret Onramper issues at registration, as UTF-8 bytes, used as-is.
- Hex is compared case-insensitively (Hookdeck's source does the same): require exactly 64 hex characters, lowercase, then compare in constant time.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyOnramperSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // validated, so nothing is dropped
  return crypto.timingSafeEqual(received, expected);
}
```

`rawBody` must be a Buffer or Uint8Array of the exact bytes received.

### Python

```python
import hashlib
import hmac
import re

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_onramper_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not secret or not signature or not _HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

## Common Gotchas

- **Raw body.** Onramper's sample hashes the body it received. Re-serializing parsed JSON changes the bytes. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Decoding the signature early.** `Buffer.from(sig, 'hex')` silently drops bad characters, so validate the length and alphabet first.
- **`===` comparison.** Onramper's sample uses it; use `timingSafeEqual` / `compare_digest`.
- **Secret decoding.** Don't hex- or base64-decode the secret.
- **Behind Hookdeck.** Hookdeck's Onramper source (HMAC, sha256, header `x-onramper-webhook-signature`, hex) verifies the same way. Retries and replays carry the original signature, which stays valid because no timestamp is signed.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every delivery | Wrong `ONRAMPER_WEBHOOK_SECRET`, or the body was parsed before verifying |
| Works for tests, fails live | A proxy or middleware re-encoded the body, or the secret has stray whitespace |
| Header missing | Webhooks not enabled for that ApiKey, or the request is not from Onramper |

To test by hand:

```bash
BODY='{"status":"pending","transactionId":"01H7D547TESTV2RQJ52ZAB7WF7","transactionType":"buy"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$ONRAMPER_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/onramper \
  -H "Content-Type: application/json" -H "X-Onramper-Webhook-Signature: $SIG" -d "$BODY"
```
