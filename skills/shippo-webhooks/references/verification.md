# How to Verify Shippo Webhook Signatures

## How Does Shippo Signature Verification Work?

Once Shippo has provisioned an HMAC secret for your account (see [setup.md](setup.md)),
every webhook includes:

```
Shippo-Auth-Signature: t=1688493073,v1=24036c00f9adad56ad83504e5dce63fe0a248631865a89fe9adb9494f6dc7c0b
```

| Part | Meaning |
|------|---------|
| `t` | Unix timestamp (seconds) when Shippo signed the request |
| `v1` | Hex-encoded HMAC-SHA256 signature |

To verify:

1. Parse `t` and `v1` from the header (split on `,`, then on the first `=`).
2. Build the signed payload: `"{t}.{raw request body}"`.
3. Compute `HMAC-SHA256(secret, signed_payload)` and hex-encode it.
4. Compare it with `v1` using a **timing-safe** comparison.
5. Optionally reject old timestamps (replay protection). This is off by default.

This is the same format as Stripe's `Stripe-Signature` header. It is **not**
Standard Webhooks.

## Is There an SDK Helper?

No. The official `shippo` packages for Node and Python have no webhook
verification helper, so verify manually as shown below.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyShippoSignature(rawBody, header, secret, toleranceSec = 0) {
  const parts = header.split(',').map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  });
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

  // Off by default; a positive toleranceSec opts in
  if (toleranceSec > 0 && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSec) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return false; // length mismatch
    }
  });
}
```

### Python

```python
import hashlib, hmac, time

def verify_shippo_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 0) -> bool:
    timestamp, signatures = None, []
    for part in header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    if not timestamp or not timestamp.isdigit() or not signatures:
        return False
    # Off by default; a positive tolerance opts in
    if tolerance > 0 and abs(time.time() - int(timestamp)) > tolerance:
        return False
    signed = f"{timestamp}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected.encode(), s.encode()) for s in signatures)
```

### Shell (Shippo's own check)

Shippo's docs give this check for confirming HMAC is configured:

```bash
signed_payload="${timestamp}.${payload}"
echo -n "$signed_payload" | openssl dgst -sha256 -hmac "$secret" | cut -d' ' -f2
```

## Verifying the URL Token (no HMAC)

If you secured the endpoint with `?token=…` instead:

```javascript
const token = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
const ok = token.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
```

```python
ok = hmac.compare_digest(request.query_params.get("token", ""), expected)
```

## Common Signature Verification Errors

- **Parsing JSON before verifying.** Re-serialised JSON won't match byte-for-byte.
  Use `express.raw()`, `await request.text()` (Next.js), or `await request.body()` (FastAPI).
- **Wrong encoding.** Shippo's signature is **hex**, not base64.
- **Wrong signed content.** The input is `t + "." + body`, not the body alone and not the whole header.
- **Decoding the secret.** Use the secret exactly as Shippo gave it, as the
  UTF-8 HMAC key. Don't base64-decode it.
- **No header at all.** `Shippo-Auth-Signature` is only sent once Shippo has
  enabled HMAC for your account. Until then, use the token or IP allowlist.
- **Header case.** Node lowercases header names (`shippo-auth-signature`). Other
  frameworks are case-insensitive.

## Timestamp Tolerance

Shippo doesn't document a tolerance window. The examples **don't check the
timestamp by default**: retries and replays carry the original timestamp, so a
window would reject a redelivery that arrives late (for example a Hookdeck retry
or manual replay).

To opt in, set `SHIPPO_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of
seconds (for example `300`). Timestamps further than that from the current time
are then rejected. A value that isn't a whole number of seconds is treated as
`0` (check off), and the examples log a warning at startup. Keep server clocks
in sync (NTP) if you turn it on.

## How to Debug Verification Failures

1. Log the raw header and body length (never the secret).
2. Recompute the signature with Shippo's shell script against the exact body
   you received. If it matches, your server is modifying the body.
3. Confirm with Shippo's solutions team that the secret you stored is the one
   they configured for this webhook.
4. Return `400` for invalid signatures. Shippo doesn't retry `4xx` (except
   `408`/`429`), so a bad secret shows up as failed deliveries rather than a retry storm.
