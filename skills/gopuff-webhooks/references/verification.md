# Gopuff Signature Verification

## How Does Gopuff Webhook Verification Work?

Gopuff's pages have no signature section. Because endpoints are registered in the Svix App Portal, deliveries use [Svix's scheme](https://docs.svix.com/receiving/verifying-payloads/how-manual):

- Headers: `svix-id`, `svix-timestamp` (seconds since epoch), `svix-signature` (space-delimited `v1,<base64>` list). White-labeled accounts may get `webhook-id` / `webhook-timestamp` / `webhook-signature`.
- Signed content: `{svix-id}.{svix-timestamp}.{raw body}`
- Algorithm: HMAC-SHA256, key = base64-decoded portion of the secret after `whsec_`, output base64.
- Compare in constant time against each `v1` entry; remove the `v1,` prefix first.
- Optionally compare `svix-timestamp` with your clock (5 minutes is typical). The examples leave this off by default because Hookdeck retries and replays keep the original timestamp; set `GOPUFF_TIMESTAMP_TOLERANCE_SECONDS` to opt in.

## Implementation

### Manual Verification (used by the examples)

```javascript
import crypto from 'node:crypto';

// rawBody: the exact bytes received (express.raw() / request.text()), NOT re-serialised JSON.
// toleranceSec = 0 (default) skips the timestamp window, because Hookdeck retries and replays
// keep the original svix-timestamp. A positive value opts in.
function verifyGopuffWebhook(rawBody, headers, secret, toleranceSec = 0) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigs = headers['svix-signature'];
  if (!id || !/^\d+$/.test(ts ?? '') || !sigs) throw new Error('Missing or malformed svix-* headers');
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) {
    throw new Error('Timestamp outside tolerance');
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); // decode; don't use the string as-is
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.`).update(rawBody).digest();
  const ok = sigs.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    const given = Buffer.from(sig ?? '', 'base64');
    return version === 'v1' && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error('Invalid signature');
}
```

```python
import base64, hashlib, hmac, time

def verify_svix(raw_body: bytes, headers, secret: str, tolerance: int = 0) -> None:
    # tolerance = 0 (default) skips the timestamp window; a positive value opts in
    msg_id, ts, sigs = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not (msg_id and ts and ts.isdigit() and sigs):
        raise ValueError("Missing or malformed svix-* headers")
    if tolerance > 0 and abs(time.time() - int(ts)) > tolerance:
        raise ValueError("Timestamp outside tolerance")
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in sigs.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and hmac.compare_digest(base64.b64decode(sig or ""), expected):
            return
    raise ValueError("Invalid signature")
```

For white-labeled `webhook-*` headers, map them to the `svix-*` names first.

### SDK Verification

**Why not the `svix` SDK?** `new Webhook(secret).verify(...)` (npm) and `Webhook(secret).verify(...)` (PyPI) check the same signature, but they always enforce a 5-minute timestamp window with no way to turn it off. Hookdeck retries and replays carry the original `svix-timestamp`, so the SDK rejects them. The examples verify manually and make the window opt-in with `GOPUFF_TIMESTAMP_TOLERANCE_SECONDS` (default `0`; a positive number of seconds turns it on; anything that isn't a whole number is treated as `0`, with a warning at startup). If you never retry or replay late, the SDK is fine.

## Common Gotchas

- Use the raw body; parsing and re-serializing JSON changes the bytes.
- Decode the secret from base64 after `whsec_`; don't use the string as the key.
- The header can hold several signatures (secret rotation); accept any valid `v1`.
- Retries and replays (Hookdeck's, or a stale captured request) keep the original `svix-timestamp`, so any timestamp window rejects them. The examples only check the window when it's set.
- The same `svix-id` is reused on retries; use it for idempotency.

## Debugging Verification Failures

- Missing headers: a proxy or framework stripped them, or the request didn't come from Svix.
- Invalid signature: wrong endpoint's secret, body modified by middleware, secret not base64-decoded.
- Timestamp error: server clock drift, or a replayed old request.
