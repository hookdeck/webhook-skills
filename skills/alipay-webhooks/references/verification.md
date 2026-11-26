# How to Verify Alipay (Antom / Alipay+) Webhook Signatures

## Why Signature Verification Matters

Your notify URL is public. Anyone could POST a fake `PAYMENT_RESULT` to it and
trick you into fulfilling an unpaid order. Alipay signs every notification with
**SHA256withRSA** using its private key; you verify with Antom's **public key**.
No valid signature → reject the request and never process the body.

## How It Works

Alipay/Antom uses an **asymmetric RSA256** scheme (not HMAC, not Standard
Webhooks). Each request carries three headers:

| Header | Example | Purpose |
|--------|---------|---------|
| `Client-Id` | `SANDBOX_5YC47N2ZQHJ004124` | Your Client ID |
| `Request-Time` | `2026-07-24T10:00:00Z` | ISO 8601 send time (part of signed content) |
| `Signature` | `algorithm=RSA256,keyVersion=1,signature=<sig>` | The RSA256 signature |

### The signed content is exactly two lines

```
<HTTP-METHOD> <URI>\n<Client-Id>.<Request-Time>.<RawBody>
```

- Line 1: the HTTP method (`POST`) and the request URI/path, separated by a space.
- Line 2: `Client-Id`, `Request-Time`, and the **raw request body**, joined by
  single periods (`.`) with **no extra whitespace**.
- The separator between the two lines is a single `\n` (newline).

Example content to verify:

```
POST /webhooks/alipay
SANDBOX_5YC47N2ZQHJ004124.2026-07-24T10:00:00Z.{"notifyType":"PAYMENT_RESULT",...}
```

### Signature encoding gotcha (READ THIS)

Antom's docs define the signature as `urlEncode(base64Encode(sha256withRSA(...)))`
and verification as `sha256withRSA_verify(base64Decode(urlDecode(<target_signature>)), ...)`,
so on the wire you'll see `%2F`, `%2B`, `%3D`. To decode:

1. `decodeURIComponent(...)` to undo the URL-encoding.
2. Optionally normalize URL-safe chars (`-`→`+`, `_`→`/`), which is harmless.
3. base64-decode to raw bytes.

Skipping step 1 makes verification fail with an otherwise-correct key.

## Implementation

There is **no official Alipay SDK helper that verifies notifications** across
these frameworks, so verification is done manually with the language's crypto
library. The signing/verification algorithm is standard `SHA256withRSA`.

### Node.js (Express, Next.js)

```javascript
const { createVerify } = require('crypto');

function parseSignatureHeader(header) {
  return Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
}

function verifyAlipaySignature({ method, uri, clientId, requestTime, rawBody, signatureHeader, publicKey }) {
  const parsed = parseSignatureHeader(signatureHeader || '');
  if (!parsed.signature) return false;
  const content = `${method} ${uri}\n${clientId}.${requestTime}.${rawBody}`;
  const sig = Buffer.from(
    decodeURIComponent(parsed.signature).replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  );
  const verifier = createVerify('RSA-SHA256');
  verifier.update(content, 'utf8');
  verifier.end();
  try {
    return verifier.verify(publicKey, sig);
  } catch {
    return false;
  }
}
```

### Python (FastAPI)

```python
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature
from urllib.parse import unquote


def parse_signature_header(header: str) -> dict:
    out = {}
    for part in header.split(","):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def verify_alipay_signature(method, uri, client_id, request_time, raw_body, signature_header, public_key_pem):
    parsed = parse_signature_header(signature_header or "")
    sig_b64 = parsed.get("signature")
    if not sig_b64:
        return False
    content = f"{method} {uri}\n{client_id}.{request_time}.{raw_body}".encode("utf-8")
    # Percent-decode, normalize URL-safe base64, pad, then decode.
    normalized = unquote(sig_b64).replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    signature = base64.b64decode(normalized)
    public_key = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    try:
        public_key.verify(signature, content, padding.PKCS1v15(), hashes.SHA256())
        return True
    except InvalidSignature:
        return False
```

## The Acknowledgement Response

Antom's docs say **no digital signature is required** when you return the
acknowledgement. Return HTTP 200 with `Content-Type: application/json` and this
body, with fixed values:

```json
{ "result": { "resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success" } }
```

Antom's example response headers also include `client-id` and `response-time`.
Until Antom receives this body it resends the notification.

## Common Gotchas

- **Raw body only.** Sign/verify the exact bytes received. Re-serializing parsed
  JSON reorders keys and changes whitespace → signature mismatch.
- **URL-decode first.** The signature is base64, then URL-encoded. URL-decode it
  before base64-decoding (see above).
- **Two-line content, single periods.** Line 1 is `METHOD URI`; line 2 joins
  `Client-Id`, time, and body with single `.` — no spaces, no trailing newline.
- **The URI is the path Antom POSTed to.** Match your route path (and query
  string, if any) exactly — e.g. `/webhooks/alipay`.
- **Return the fixed ack body.** Anything else and Antom resends the
  notification. The ack needs no signature.
- **No single `type` field.** The type is in `notifyType`, `authorizationNotifyType`,
  `disputeNotificationType` or `subscriptionNotificationType`, depending on the
  notification API.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always fails, key is correct | Signature not URL-decoded before base64-decoding |
| Fails only for some payloads | Body was parsed & re-serialized; use the raw body |
| Fails after a proxy/CDN | Line 1 URI doesn't match the actual request path/query |
| Fails intermittently | Using the wrong key (sandbox vs production, or your key vs Antom's) |
| Antom keeps resending despite 200 | Response body isn't the fixed `result` acknowledgement |
