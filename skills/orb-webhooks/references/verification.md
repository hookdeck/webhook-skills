# Orb Signature Verification

## How It Works

Orb signs every webhook with HMAC-SHA256 using your **per-endpoint** signing secret (not the account API key). Two headers carry the signature material:

| Header | Contents |
|--------|----------|
| `X-Orb-Signature` | `v1=<hex>` — the HMAC-SHA256 hex digest, prefixed with the version literal `v1=`. During a secret rotation it can carry several space-separated values |
| `X-Orb-Timestamp` | ISO 8601 timestamp of when Orb sent the request, to milliseconds |

The signed content is the literal string:

```
v1:{X-Orb-Timestamp}:{raw-body}
```

That is: the version literal `v1`, a colon, the timestamp from `X-Orb-Timestamp` exactly as delivered, a colon, then the raw HTTP request body. Compute HMAC-SHA256 of that string with your signing secret, hex-encode, and compare to the value after `v1=` in `X-Orb-Signature`. If the header holds several space-separated signatures (a secret rotation), accept the delivery when any one matches.

## Implementation

Orb's Python, TypeScript, Java and Kotlin SDKs verify the signature as they parse an event: `client.webhooks.unwrap()` for expanded payloads and `unwrapStandard()` / `unwrap_standard()` for standard ones. In Go, call `client.Webhooks.VerifySignature` before parsing; in Ruby, verify it yourself. The manual HMAC below is the dependency-free path.

### Node.js (manual)

```javascript
const crypto = require('crypto');

function verifyOrbSignature(rawBody, signatureHeader, timestamp, secret) {
  if (!signatureHeader || !timestamp) return false;

  const signedContent = `v1:${timestamp}:${rawBody}`;
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(signedContent).digest('hex'),
    'hex'
  );

  // Several space-separated signatures can arrive during a secret rotation
  return signatureHeader.split(' ').some((entry) => {
    const provided = entry.startsWith('v1=') ? entry.slice(3) : entry;
    try {
      return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
    } catch {
      return false; // different lengths → invalid
    }
  });
}
```

### Python (manual)

```python
import hmac
import hashlib

def verify_orb_signature(raw_body: bytes, signature_header: str, timestamp: str, secret: str) -> bool:
    if not signature_header or not timestamp:
        return False

    signed_content = f"v1:{timestamp}:".encode() + raw_body
    expected = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()

    # Several space-separated signatures can arrive during a secret rotation
    for entry in signature_header.split(" "):
        provided = entry[3:] if entry.startswith("v1=") else entry
        if hmac.compare_digest(provided, expected):
            return True
    return False
```

## Timestamp Tolerance (Replay Protection)

Orb's docs leave the threshold to you: compare `X-Orb-Timestamp` with a tolerance you configure. Orb's SDKs use **5 minutes** when they verify, so that's a sensible default. Reject any request where `X-Orb-Timestamp` is more than 5 minutes off your server clock.

```javascript
const TOLERANCE_SECONDS = 300;
const deliveredAt = new Date(timestamp).getTime() / 1000;
const now = Date.now() / 1000;
if (Math.abs(now - deliveredAt) > TOLERANCE_SECONDS) {
  return false; // stale or future-dated request
}
```

Combine this with **idempotency keyed on the event `id`** — Orb delivers at-least-once and retries can occur outside the freshness window during recovery scenarios.

## Common Gotchas

### 1. Raw Body Requirement

The most common cause of verification failures is using a parsed JSON body instead of the raw request body. JSON re-serialization changes whitespace and key ordering, which invalidates the HMAC.

**Express:** use `express.raw({ type: 'application/json' })` for the webhook route.

**Next.js App Router:** call `await request.text()` (not `await request.json()`) to get the raw body string before verifying.

**FastAPI:** call `await request.body()` to get the raw bytes before verifying.

### 2. The `v1=` Prefix

`X-Orb-Signature` is `v1=<hex>`, not bare hex. Strip the `v1=` prefix before comparing — or compare against `v1=` + computed hex. Split the header on spaces first: during a secret rotation it carries several signatures, and comparing the whole header fails.

### 3. Timestamp Format

`X-Orb-Timestamp` is **ISO 8601 with milliseconds**, not a Unix epoch. Use it byte-for-byte in the signed content string; do not parse and re-serialize it.

### 4. Per-Endpoint Secrets

Each webhook endpoint has its **own** secret, returned once by the Create webhook endpoint API. If you wire up several endpoints, use each one's secret. Don't use the account API key — verification will fail.

### 5. Use a Timing-Safe Comparison

Compare signatures with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python). Plain `===` / `==` leaks timing information that can be used to forge signatures.

## Debugging Verification Failures

### Verification keeps returning false

1. **Log the raw body type** — it should be `Buffer`/`bytes`/`string`, not an object.
2. **Log the signed content** — confirm it starts with `v1:`, contains the exact timestamp from the header, and the body has not been re-serialized.
3. **Re-check the secret** — confirm it's the per-endpoint signing secret, not the account API key.
4. **Confirm clock skew** — `date -u` on your server vs. the `X-Orb-Timestamp` value.

### Timestamp outside tolerance

1. Check the server clock with `date -u`.
2. For local testing with replayed events, widen the tolerance temporarily.

## Full Documentation

For complete signature verification details, see [Orb's webhook security page](https://docs.withorb.com/integrations-and-exports/webhooks/security).
