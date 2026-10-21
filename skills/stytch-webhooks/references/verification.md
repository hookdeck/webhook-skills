# Stytch Webhook Signature Verification

## How Does Verification Work?

Stytch delivers webhooks through Svix. Every request includes:

| Header | Meaning |
|--------|---------|
| `svix-id` | Unique message ID; the same on retries |
| `svix-timestamp` | Seconds since epoch |
| `svix-signature` | Space-delimited list of `v1,<base64>` signatures |

1. Build the signed content: `{svix-id}.{svix-timestamp}.{raw body}`.
2. Base64-decode the part of the `whsec_` secret after the prefix and use it as the HMAC key.
3. Compute HMAC-SHA256 and base64-encode it.
4. Strip the `v1,` prefix from each entry in `svix-signature` and compare with a constant-time function. Any match is valid.
5. Optionally check `svix-timestamp` is within a tolerance (the Svix SDKs always use 5 minutes). The examples leave this off by default because Hookdeck retries and replays keep the original timestamp; set `STYTCH_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in.

## Manual Verification (used by the examples)

```javascript
import crypto from 'node:crypto';

// rawBody: the exact bytes received (express.raw() / request.text()), NOT re-serialised JSON.
// toleranceSec = 0 (default) skips the timestamp window, because Hookdeck retries and replays
// keep the original svix-timestamp. A positive value opts in.
function verifyStytchWebhook(rawBody, headers, secret, toleranceSec = 0) {
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

## SDK Verification

**Why not the `svix` SDK?** `new Webhook(secret).verify(...)` (npm) and `Webhook(secret).verify(...)` (PyPI) check the same signature, but they always enforce a 5-minute timestamp window with no way to turn it off. Hookdeck retries and replays carry the original `svix-timestamp`, so the SDK rejects them. The examples verify manually and make the window opt-in with `STYTCH_TIMESTAMP_TOLERANCE_SECONDS` (default `0`; a positive number of seconds turns it on; anything that isn't a whole number is treated as `0`, with a warning at startup). If you never retry or replay late, the SDK is fine.

Svix's published test vector: secret `whsec_plJ3nmyCDGBKInavdOK15jsl`, payload `{"event_type":"ping","data":{"success":true}}`, id `msg_loFOjxBNrRLzqYUf`, timestamp `1731705121` produces `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=` (the timestamp is old, so the SDK, or the examples with the window turned on, reject it).

## Common Gotchas

- **Raw body**: use `express.raw({ type: '*/*' })`, `request.text()` in Next.js, and `await request.body()` in FastAPI.
- **Secret decoding**: the key is the base64-*decoded* bytes after `whsec_`, not the literal string.
- **Multiple signatures**: during secret rotation the header holds several; accept any `v1` match.
- **Timestamp**: the SDKs reject timestamps more than 5 minutes off, which also rejects Hookdeck retries and replays (they keep the original timestamp). The examples only check the window when it's set; if you turn it on and every delivery fails with a timestamp error, check your server clock.
- **Wrong secret**: each endpoint has its own `whsec_` secret; copy it from the endpoint that is sending.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Invalid signature` on every request | Wrong endpoint secret, or body parsed/re-serialized before verifying |
| `Timestamp too old` | Server clock drift, or replaying an old delivery |
| `Missing required webhook headers` | Request did not come from Stytch/Svix, or a proxy stripped the headers |
