# How to Verify Pipedream Webhook Signatures

## Which Pipedream Webhooks Can Be Verified?

Only **Connect trigger webhooks** are documented as signed. **Connection webhooks** (`CONNECTION_SUCCESS` / `CONNECTION_ERROR` sent to a Connect token's `webhook_uri`) and plain workflow HTTP requests are **not** documented as signed, so there is no `x-pd-signature` to check on them. For those:

- Put an unguessable secret in the URL you register (e.g. `?token=<random>`) and compare it in constant time.
- Treat the payload as a notification only: confirm `account.id` with [Retrieve Account](https://pipedream.com/docs/connect/api-reference/retrieve-account) before acting on it.

## How It Works

Every trigger webhook delivery includes:

```
x-pd-signature: t=1616000000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

| Part | Meaning |
|------|---------|
| `t` | UNIX timestamp (seconds) when the signature was generated |
| `v1` | HMAC-SHA256 hex digest of the signed payload |

- **Signed payload:** `{t}.{raw_body}` (the timestamp, a `.`, then the raw request body)
- **Algorithm:** HMAC-SHA256, hex encoded
- **Key:** the signing key as a UTF-8 string, exactly as Pipedream gave it (shown once when the webhook URL is saved, project-level or trigger-level)
- **Not Standard Webhooks:** there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers.

## Implementation

### SDK Verification

None. `@pipedream/sdk` (and the Python SDK) can create webhooks and return signing keys, but has no verification helper. Verify manually.

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyPipedreamSignature(rawBody, header, signingKey, toleranceSeconds = 300) {
  if (!header) return { valid: false, error: 'Missing x-pd-signature header' };

  let timestamp;
  const signatures = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) signatures.push(value.toLowerCase());
  }
  if (!timestamp || !/^[0-9]+$/.test(timestamp) || signatures.length === 0) {
    return { valid: false, error: 'Malformed x-pd-signature header' };
  }

  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) {
    return { valid: false, error: 'Timestamp outside tolerance' };
  }

  const expected = crypto.createHmac('sha256', signingKey)
    .update(`${timestamp}.`).update(rawBody).digest('hex');

  const ok = signatures.some((sig) =>
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  return ok ? { valid: true } : { valid: false, error: 'Invalid signature' };
}
```

### Manual Verification (Python)

```python
import hashlib, hmac, re, time

def verify_pipedream_signature(raw_body: bytes, header: str | None, signing_key: str, tolerance: int = 300):
    if not header:
        return False, "Missing x-pd-signature header"
    timestamp, signatures = None, []
    for part in header.split(","):
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if key == "t":
            timestamp = value
        elif key == "v1" and value:
            signatures.append(value.lower())
    if not timestamp or not re.fullmatch(r"[0-9]+", timestamp) or not signatures:
        return False, "Malformed x-pd-signature header"
    if abs(int(time.time()) - int(timestamp)) > tolerance:
        return False, "Timestamp outside tolerance"
    expected = hmac.new(signing_key.encode("utf-8"), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if any(hmac.compare_digest(expected, s) for s in signatures):
        return True, None
    return False, "Invalid signature"
```

The full handlers are in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## How Do I Prevent Replay Attacks?

Pipedream recommends rejecting requests whose `t` is too old; its example uses 5 minutes (`MAX_AGE_SECONDS = 300`). Because `t` is inside the signed payload, an attacker can't refresh it without the key. The examples also reject timestamps more than 300 seconds in the future to allow for clock skew both ways.

## Common Gotchas

- **Raw body.** Sign over the exact bytes received. `express.json()`, `await request.json()` or re-serialising with `JSON.stringify` / `json.dumps` changes whitespace and key order and breaks the HMAC. Use `express.raw()`, `request.arrayBuffer()` / `request.text()`, or `await request.body()`.
- **Header name.** `x-pd-signature`. Node and Starlette lowercase header names; FastAPI's `Header()` maps `x_pd_signature` to it.
- **Hex, not base64.** `v1` is a lowercase hex digest (64 characters).
- **Wrong key.** Trigger-level URLs have their own signing key, separate from the project-level URL's key, and each environment has its own project webhook.
- **Key shown once.** The UI shows the signing key only when you save the URL, and Set Project Environment Webhook returns it only on create, not update. If you lost it, regenerate it.
- **Length mismatch.** `crypto.timingSafeEqual` throws on unequal lengths; check lengths first (as above) so a malformed signature returns `false` instead of a 500.
- **Expecting a signature on connection webhooks.** `CONNECTION_SUCCESS` / `CONNECTION_ERROR` aren't documented as signed; don't route them through the `x-pd-signature` check or every one will fail.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Missing x-pd-signature header` on every request | It's a connection webhook (unsigned), or a proxy is stripping the header |
| `Invalid signature` on every request | Wrong signing key (project vs trigger vs environment), or body parsed before verification |
| `Timestamp outside tolerance` | Server clock drift (check NTP), or you are replaying an old captured request |

Log the length of the raw body and the `t` value, recompute the HMAC by hand with the same key, and compare with `v1`.
