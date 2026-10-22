# How to Verify Increase Webhook Signatures

## How It Works

Increase follows the Standard Webhooks spec for headers and signed content:

1. Take `webhook-id`, `webhook-timestamp`, and `webhook-signature`.
2. Build the signed payload: `<webhook-id>.<webhook-timestamp>.<raw request body>`.
3. HMAC-SHA256 it, keyed with the Event Subscription's `shared_secret`, and base64-encode the digest.
4. Prefix with `v1,` and compare in constant time to each space-separated value in `webhook-signature` (more than one is sent while a secret is rotating).

## Why Not the standardwebhooks Library?

Standard Webhooks secrets look like `whsec_<base64>` and the libraries base64-decode the part after the prefix to get the key. Increase's `shared_secret` is used directly as **raw UTF-8 bytes**, so passing it to the library as-is decodes it into the wrong key and every valid webhook fails. Increase's own sample is `OpenSSL::HMAC.digest('SHA256', signing_secret, signed_payload)`. Verify manually, as the examples do.

Hookdeck's Increase source does the same: a secret that doesn't start with `whsec_` is used as UTF-8 bytes. So use the secret Increase generates, or a custom one that doesn't begin with `whsec_`.

## Implementation (Node.js)

```javascript
const crypto = require('crypto');

function verifyIncrease(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const header = headers['webhook-signature'];
  if (!secret || !id || !timestamp || !header) return false;

  const expected = 'v1,' + crypto.createHmac('sha256', secret)
    .update(`${id}.${timestamp}.`).update(rawBody).digest('base64');

  return header.split(' ').some((sig) => {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

## Implementation (Python)

```python
import base64, hashlib, hmac

def verify_increase(raw_body: bytes, headers, secret: str) -> bool:
    wid, ts, header = (headers.get(h) for h in ("webhook-id", "webhook-timestamp", "webhook-signature"))
    if not (secret and wid and ts and header):
        return False
    digest = hmac.new(secret.encode(), f"{wid}.{ts}.".encode() + raw_body, hashlib.sha256).digest()
    expected = "v1," + base64.b64encode(digest).decode()
    return any(hmac.compare_digest(s.encode(), expected.encode()) for s in header.split(" "))
```

## Timestamp Window: Where to Drop or Widen It

Increase's docs suggest rejecting a `webhook-timestamp` more than 5 minutes from now (`abs(now - timestamp) <= 300`). **Hookdeck retries and replays resend the original timestamp**, so a 5-minute window rejects every late retry and replay.

The examples make this check opt-in through `INCREASE_TIMESTAMP_TOLERANCE_SECONDS`:

- **`0` or unset (default):** no timestamp check. Rely on the signature plus deduplication by `webhook-id`.
- **A positive number:** reject if `abs(now - webhook-timestamp)` exceeds it. Set it above your longest acceptable retry or replay delay (Increase's retry schedule spans about 72 hours, `259200` seconds), or use `300` only when requests reach you directly and you never replay.

To remove the window from your own code, delete the block in `verifyIncrease` that reads `timestampToleranceSeconds()` (Express and Next.js) or `timestamp_tolerance_seconds()` (FastAPI); to widen it, set the environment variable.

## Common Gotchas

- **Raw body:** sign over the exact bytes received. Use `express.raw({ type: '*/*' })` in Express so any content type reaches the verifier as a Buffer, `request.text()` in Next.js, and `await request.body()` in FastAPI. Don't re-serialize parsed JSON.
- **Raw secret:** don't base64-decode the secret and don't strip a prefix.
- **Multiple signatures:** check every space-separated value, not just the first.
- **Length mismatch:** `crypto.timingSafeEqual` throws on different lengths; check lengths first.
- **Status codes:** return `400` on a bad signature, but remember Increase retries any non-2xx, so a persistent verification bug causes retries for up to 72 hours.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Secret copied from another subscription (sandbox vs production), or secret base64-decoded |
| Fails only on some events | Body altered by a parser or proxy before verification |
| Works at first, fails on retries | A timestamp window is rejecting late retries; turn it off or widen it |
| Fails after rotating the secret | Only the new secret is configured; both signatures are sent during rotation, so check each |
