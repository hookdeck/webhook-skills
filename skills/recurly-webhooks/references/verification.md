# How to Verify Recurly Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Without verification, anyone who finds it
could POST fake subscription or payment notifications and trick your app into
provisioning access or issuing refunds. For **JSON** payloads, Recurly signs each
notification so you can prove it came from Recurly and was not modified in
transit.

> **XML payloads are not signed.** If you use XML, you cannot verify a signature —
> secure the endpoint with HTTP Basic Auth and an IP allowlist instead
> (see [setup.md](setup.md)). Prefer JSON so you get signature verification.

There is no signature-verification helper in the official `recurly` SDK (it is an
API client), so verify manually with HMAC-SHA256 as shown below.

## How It Works

Recurly sends a `recurly-signature` header on JSON notifications:

```
recurly-signature: 1659641851000,a8c8524a0cdd99e36b55d9fdf6c8aed2c2315dfa1a36c4961f65986ee6cf6ae9
```

- **Header format:** a Unix timestamp (in milliseconds) followed by one or more
  signatures, all comma-separated. The first element is the timestamp; the rest
  are signatures.
- **Algorithm:** HMAC-SHA256.
- **Encoding:** lowercase **hex**.
- **Signed message:** the timestamp, a literal `.`, then the **raw request body**
  → `` `${timestamp}.${rawBody}` ``.
- **Secret:** the endpoint's secret key from the Webhook Endpoints page
  (`RECURLY_WEBHOOK_SECRET`).
- **Multiple signatures:** appear for 24 hours after you regenerate the secret
  key (old + new key). The notification is valid if **any one** signature matches.

### Verification steps

1. Split the `recurly-signature` header on `,`. The head is the timestamp; the
   tail is the list of signatures.
2. Compute `HMAC_SHA256(secret, `${timestamp}.${rawBody}`)` and hex-encode it.
3. Compare your computed value against each signature from the header using a
   **constant-time** comparison. Accept if any one matches.

## Implementation

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyRecurlySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const [timestamp, ...signatures] = header.split(',');
  if (!timestamp || signatures.length === 0) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)                 // Buffer or string of the raw body
    .digest('hex');

  const expBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig.trim());
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  });
}
```

### Python (manual)

```python
import hmac
import hashlib

def verify_recurly_signature(raw_body: bytes, header: str, secret: str) -> bool:
    if not header or not secret:
        return False
    parts = header.split(",")
    timestamp, signatures = parts[0], parts[1:]
    if not timestamp or not signatures:
        return False

    message = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

    # Valid if any signature matches (multiple appear during key rotation).
    return any(hmac.compare_digest(expected, sig.strip()) for sig in signatures)
```

## HTTP Basic Auth (defense in depth / XML)

If you configured Basic Auth on the endpoint, also verify the `Authorization`
header. Enforce it only when credentials are configured, and compare in constant
time:

```javascript
function verifyBasicAuth(authHeader, user, password) {
  if (!user && !password) return true;                 // not configured → skip
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  const gotUser = decoded.slice(0, sep);
  const gotPass = decoded.slice(sep + 1);
  return safeEqual(gotUser, user || '') && safeEqual(gotPass, password || '');
}
```

## Common Gotchas

- **Use the raw body.** Verify the exact bytes Recurly sent. If you `JSON.parse`
  and re-serialize before verifying, whitespace/key-order differences will break
  the HMAC. Capture the raw body (Express `express.raw`, Next.js `request.text()`,
  FastAPI `await request.body()`).
- **Timestamp is part of the signed string.** Don't strip or reformat it — use the
  exact timestamp string from the header when recomputing the HMAC.
- **Milliseconds, not seconds.** Recurly's documented timestamp is in
  milliseconds. You don't need to interpret it (just feed it into the HMAC), but
  don't assume seconds if you add your own freshness/tolerance check.
- **Accept multiple signatures.** During a 24h key rotation the header contains
  more than one signature. Match against all of them; accept if any matches.
- **Hex, not base64.** Recurly signatures are lowercase hex.
- **XML isn't signed.** Don't expect a `recurly-signature` header on XML
  endpoints — use Basic Auth + IP allowlist there.
- **Constant-time compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  and guard against length mismatches so the comparison never throws.

## Debugging Verification Failures

- **Always fails:** You're probably verifying a parsed-then-reserialized body.
  Log the raw body length and the first bytes and compare against Content-Length.
- **Wrong secret:** Confirm `RECURLY_WEBHOOK_SECRET` is the secret for **this**
  endpoint (each endpoint has its own).
- **Header missing:** The endpoint is likely configured for XML (unsigned) or the
  request isn't from Recurly. Switch the endpoint to JSON.
- **Intermittent failures right after rotating the key:** Ensure your verifier
  loops over **all** signatures in the header, not just the first.
