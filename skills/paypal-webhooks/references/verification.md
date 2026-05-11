# PayPal Signature Verification

## How It Works

PayPal signs every webhook transmission with its own private key. You verify
the signature with the **public certificate** that PayPal serves at a URL it
sends in the request headers. The algorithm is `SHA256withRSA` (RSA with
SHA-256, PKCS#1 v1.5 padding).

### Headers PayPal Sends

| Header | Description |
|--------|-------------|
| `paypal-transmission-id` | UUID-like ID for this delivery attempt |
| `paypal-transmission-time` | ISO 8601 timestamp PayPal generated the event |
| `paypal-transmission-sig` | Base64-encoded RSA-SHA256 signature |
| `paypal-cert-url` | URL of the public cert (PEM); must be on `*.paypal.com` |
| `paypal-auth-algo` | `SHA256withRSA` (the only currently used value) |

### Signed Message

```
<transmissionId>|<transmissionTime>|<webhookId>|<crc32(rawBody)>
```

- `<webhookId>` is the value of `PAYPAL_WEBHOOK_ID` for the webhook that
  delivered this event. PayPal does **not** include it in the request — you
  have to know which webhook is hitting your endpoint.
- `<crc32(rawBody)>` is the standard CRC-32 of the raw request body as an
  **unsigned decimal integer** (not hex, not signed).
- The raw body must be the bytes PayPal sent — do **not** re-serialize the
  parsed JSON, since whitespace and key order would change.

## Two Verification Paths

### 1. Postback (no crypto, requires OAuth)

Recommended by PayPal for simplicity. POST the captured headers plus the raw
event body to PayPal:

```
POST https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature
Authorization: Bearer <oauth-access-token>
Content-Type: application/json

{
  "transmission_id":   "<paypal-transmission-id>",
  "transmission_time": "<paypal-transmission-time>",
  "cert_url":          "<paypal-cert-url>",
  "auth_algo":         "<paypal-auth-algo>",
  "transmission_sig":  "<paypal-transmission-sig>",
  "webhook_id":        "<PAYPAL_WEBHOOK_ID>",
  "webhook_event":     <the parsed event JSON object>
}
```

Response:

```json
{ "verification_status": "SUCCESS" }
```

Anything other than `SUCCESS` means reject the webhook. The OAuth token is
obtained by hitting `/v1/oauth2/token` with Basic auth (`client_id:secret`).

**Tradeoffs**
- ✅ No certificate parsing — PayPal does all crypto.
- ❌ Adds a round-trip to PayPal per webhook (latency + extra failure mode).
- ❌ Requires you to keep an OAuth token cached and refreshed.

### 2. Offline Self-Verify (used in this skill's examples)

Do the crypto locally. Faster and avoids the OAuth dependency.

```
1. Read the 4 paypal-* headers (id, time, sig, cert-url).
2. Validate cert-url host endsWith ".paypal.com" (or equals "paypal.com").
3. Fetch the cert (PEM) from cert-url. Cache by URL forever — PayPal rotates
   certs by changing the URL, so a cache miss == new cert == fetch once.
4. Compute crc32 of the raw body as an UNSIGNED decimal.
5. Build the message:  `${id}|${time}|${webhookId}|${crc32}`.
6. RSA-SHA256-verify the base64-decoded signature against the message using
   the cert's public key.
```

**Tradeoffs**
- ✅ No extra API call.
- ✅ Fully testable offline with a generated key pair.
- ❌ You handle PEM parsing and cert caching.

## Implementation

### SDK Verification

PayPal's official server SDKs (`@paypal/paypal-server-sdk` for Node,
`paypalrestsdk` for Python) do not expose a stable local
"verify webhook signature" helper. Both projects document the postback API
instead. Implement verification yourself with `crypto` (Node) or
`cryptography` (Python) — see the examples.

### Node / Express (Offline)

```javascript
const crypto = require('crypto');
const zlib = require('zlib');
const https = require('https');

const certCache = new Map();

async function fetchCert(certUrl) {
  const host = new URL(certUrl).hostname;
  if (host !== 'paypal.com' && !host.endsWith('.paypal.com')) {
    throw new Error('Cert URL host is not paypal.com');
  }
  if (certCache.has(certUrl)) return certCache.get(certUrl);
  const pem = await new Promise((resolve, reject) => {
    https.get(certUrl, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
  certCache.set(certUrl, pem);
  return pem;
}

async function verifyPayPalWebhook(headers, rawBody, webhookId) {
  const id = headers['paypal-transmission-id'];
  const time = headers['paypal-transmission-time'];
  const sig = headers['paypal-transmission-sig'];
  const certUrl = headers['paypal-cert-url'];
  if (!id || !time || !sig || !certUrl) return false;

  const crc = zlib.crc32(rawBody);            // Node ≥ 22
  const message = `${id}|${time}|${webhookId}|${crc}`;
  const cert = await fetchCert(certUrl);

  const v = crypto.createVerify('SHA256');
  v.update(message);
  v.end();
  try { return v.verify(cert, sig, 'base64'); } catch { return false; }
}
```

### Python / FastAPI (Offline)

```python
import zlib, base64, httpx
from urllib.parse import urlparse
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

_cert_cache: dict[str, bytes] = {}

def fetch_cert(cert_url: str) -> bytes:
    host = urlparse(cert_url).hostname or ""
    if host != "paypal.com" and not host.endswith(".paypal.com"):
        raise ValueError("Cert URL host is not paypal.com")
    if cert_url in _cert_cache:
        return _cert_cache[cert_url]
    pem = httpx.get(cert_url, timeout=10).content
    _cert_cache[cert_url] = pem
    return pem

def verify_paypal_webhook(headers, raw_body: bytes, webhook_id: str) -> bool:
    tid  = headers.get("paypal-transmission-id")
    ttime = headers.get("paypal-transmission-time")
    sig   = headers.get("paypal-transmission-sig")
    curl  = headers.get("paypal-cert-url")
    if not all([tid, ttime, sig, curl]):
        return False

    crc = zlib.crc32(raw_body) & 0xFFFFFFFF
    message = f"{tid}|{ttime}|{webhook_id}|{crc}".encode()
    cert = x509.load_pem_x509_certificate(fetch_cert(curl))

    try:
        cert.public_key().verify(
            base64.b64decode(sig),
            message,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except InvalidSignature:
        return False
```

## Common Gotchas

- **Parsed JSON ≠ raw body.** CRC-32 is byte-sensitive. Always use the raw
  request bytes (`express.raw()` in Express, `request.text()` in Next.js App
  Router, `await request.body()` in FastAPI). Re-serializing with
  `JSON.stringify(req.body)` will change whitespace and break verification.
- **CRC-32 must be unsigned decimal.** Some CRC libraries return a signed
  32-bit int. PayPal expects the unsigned form (e.g. `3632233996`, not
  `-662733300`). In Node use `zlib.crc32(buf)` (returns unsigned). In Python
  mask with `& 0xFFFFFFFF`.
- **`paypal-cert-url` must be validated.** If you fetch any URL the request
  asked you to, an attacker can serve their own cert and forge signatures.
  Reject any host whose suffix isn't `.paypal.com` (or exactly `paypal.com`).
- **Cache the cert.** Don't fetch it on every webhook — the URL is stable
  until PayPal rotates, at which point the URL changes. Cache by URL.
- **Wrong webhook ID = silent failure.** A sandbox webhook ID against a live
  event (or vice versa) computes a different message → signature mismatch.
- **Header casing.** Node and FastAPI lowercase header names. The official
  docs sometimes show `PAYPAL-TRANSMISSION-ID` — both are the same header,
  but in code use the lowercased form.
- **Node version.** `zlib.crc32` requires Node ≥ 22. On older Node, use the
  `buffer-crc32` package or implement CRC-32 inline.
- **OAuth scoping (postback path).** The access token for sandbox lives at
  `https://api-m.sandbox.paypal.com/v1/oauth2/token`; live at
  `https://api-m.paypal.com/v1/oauth2/token`. Cache and refresh ~30s before
  expiry.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Signature verifies in test, fails in prod | Different `PAYPAL_WEBHOOK_ID` between environments, or sandbox event hitting live endpoint |
| Always false, no errors | Body was JSON-parsed before CRC-32; or middleware (`express.json()`) consumed the stream |
| Always false, only intermittently | Cert URL rotated; clear cache or check the rotation handling |
| `crypto.createVerify` throws | Cert is not valid PEM or signature is not valid base64 |
| Works locally, breaks behind proxy | Proxy stripped `paypal-*` headers or reformatted the body |

Log the four `paypal-*` headers, the first 200 bytes of `rawBody`, the
computed CRC-32, and the message string when you debug — these are enough to
reproduce the verification offline.
