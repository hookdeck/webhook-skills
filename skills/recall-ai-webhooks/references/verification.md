# How to Verify Recall.ai Webhook Signatures

## How It Works

Recall.ai signs requests with the [Standard Webhooks](https://www.standardwebhooks.com/) scheme (delivered by Svix for dashboard webhooks).

| Item | Value |
|------|-------|
| Headers (workspace secret) | `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| Headers (legacy Svix endpoint secret) | `svix-id`, `svix-timestamp`, `svix-signature` |
| Secret format | `whsec_` + base64 key |
| HMAC key | base64-decoded part after `whsec_` |
| Signed content | `{id}.{timestamp}.{raw body}` |
| Algorithm | HMAC-SHA256, base64 encoded |
| Signature header | space-delimited list of `v1,<base64>` |

Example headers:

```
webhook-id: msg_loFOjxBNrRLzqYUf
webhook-timestamp: 1731705121
webhook-signature: v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=
```

There's no Recall.ai SDK for verification. The examples implement Recall.ai's documented function directly, which works in every framework.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyRecallSignature(rawBody, headers, secret, toleranceSeconds = 300) {
  if (!secret?.startsWith('whsec_')) return false;
  const prefix = headers['webhook-signature'] !== undefined ? 'webhook' : 'svix';
  const id = headers[`${prefix}-id`];
  const ts = headers[`${prefix}-timestamp`];
  const sigHeader = headers[`${prefix}-signature`];
  if (!id || !ts || !sigHeader || !/^[0-9]+$/.test(ts)) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.slice(6), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.`).update(rawBody).digest();

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const bytes = Buffer.from(sig, 'base64');
    return bytes.length === expected.length && crypto.timingSafeEqual(bytes, expected);
  });
}
```

### Python

```python
import base64, hashlib, hmac, time

def verify_recall_signature(raw_body: bytes, headers, secret: str, tolerance_seconds: int = 300) -> bool:
    if not secret or not secret.startswith("whsec_"):
        return False
    prefix = "webhook" if headers.get("webhook-signature") is not None else "svix"
    msg_id = headers.get(f"{prefix}-id")
    ts = headers.get(f"{prefix}-timestamp")
    sig_header = headers.get(f"{prefix}-signature")
    if not msg_id or not ts or not sig_header or not ts.isdigit():
        return False
    if tolerance_seconds > 0 and abs(time.time() - int(ts)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret[len("whsec_"):])
    expected = hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()

    for entry in sig_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and sig:
            try:
                if hmac.compare_digest(base64.b64decode(sig, validate=True), expected):
                    return True
            except ValueError:
                continue
    return False
```

### Generic Standard Webhooks libraries

Because the scheme is Standard Webhooks, the `standardwebhooks` (npm/PyPI) and `svix` libraries also verify these requests. `standardwebhooks` reads only `webhook-*` header names, so map `svix-*` headers to `webhook-*` first on legacy accounts.

## Common Gotchas

- **Raw body.** Sign the exact bytes received. `JSON.parse` then `JSON.stringify`, or FastAPI's `await request.json()`, changes whitespace and breaks the signature. Use `express.raw()`, `await request.text()` in Next.js, or `await request.body()` in FastAPI.
- **Decode the secret.** The HMAC key is the base64-decoded part after `whsec_`, not the literal string.
- **Several signatures.** After a rotation the header carries one `v1,...` per active secret (up to 24 hours). Accept if any matches; don't just take the first.
- **Header prefix.** Legacy accounts get `svix-*` headers on Svix webhooks but `webhook-*` headers on real-time endpoints. Accept both.
- **Missing headers.** `webhook-*` headers only appear after you create a workspace verification secret.
- **Timestamp window.** Recall.ai's sample doesn't check one. The examples reject timestamps more than 5 minutes off, as Standard Webhooks recommends; pass `0` to turn it off.
- **Event field.** The event name is `event.event`, not `event.type`.
- **Desktop SDK.** Real-time webhooks from the Desktop Recording SDK are unsigned for now, so this check fails for them.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Missing webhook-id, webhook-timestamp or webhook-signature header` | No workspace secret created yet, or a proxy stripped the headers |
| `No matching signature found` on every request | Wrong secret (workspace vs. per-endpoint Svix secret), secret not base64-decoded, or the body was parsed first |
| Fails only on legacy Svix webhooks | Using the workspace secret; legacy accounts need the endpoint signing secret from the Webhooks dashboard |
| `Timestamp outside tolerance` | Server clock drift, or replaying an old captured request |

Send a locally signed request to check your handler end to end. The example tests (`examples/*/test*`) show how to build valid headers.
