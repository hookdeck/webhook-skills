# Daytona Signature Verification

## How Are Daytona Webhooks Signed?

Daytona's [webhooks page](https://www.daytona.io/docs/en/webhooks) documents events and payloads only; it has no signature section. Daytona's source shows deliveries are sent through Svix and that the Dashboard reads the Svix endpoint secret, so the scheme is [Svix's manual verification](https://docs.svix.com/receiving/verifying-payloads/how-manual). This is inferred rather than documented by Daytona, so verify against a real delivery before relying on it.

| Item | Value |
|------|-------|
| Headers | `svix-id`, `svix-timestamp`, `svix-signature` |
| Algorithm | HMAC-SHA256, base64 |
| Signed content | `{svix-id}.{svix-timestamp}.{raw body}` |
| Key | base64-**decode** the part of the secret after `whsec_` |
| `svix-signature` | Space-delimited list like `v1,<sig> v1,<sig2>`; match any `v1` entry |
| Timestamp | Seconds since epoch. The window is opt-in (`DAYTONA_TIMESTAMP_TOLERANCE_SECONDS`); the `svix` SDK always enforces 5 minutes |

This is not Standard Webhooks (`webhook-*` headers). The Svix libraries accept both header prefixes.

## Verification

The examples verify manually.

```javascript
import crypto from 'node:crypto';

// rawBody: the exact bytes received (express.raw() / request.text()), NOT re-serialised JSON.
// toleranceSec = 0 (default) skips the timestamp window, because Hookdeck retries and replays
// keep the original svix-timestamp. A positive value opts in.
function verifyDaytonaWebhook(rawBody, headers, secret, toleranceSec = 0) {
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
  return JSON.parse(rawBody.toString('utf8'));
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

**Why not the `svix` SDK?** `new Webhook(secret).verify(...)` (npm) and `Webhook(secret).verify(...)` (PyPI) check the same signature, but they always enforce a 5-minute timestamp window with no way to turn it off. Hookdeck retries and replays carry the original `svix-timestamp`, so the SDK rejects them. The examples verify manually and make the window opt-in with `DAYTONA_TIMESTAMP_TOLERANCE_SECONDS` (default `0`; a positive number of seconds turns it on; anything that isn't a whole number is treated as `0`, with a warning at startup). If you never retry or replay late, the SDK is fine.

Svix's published test vector: secret `whsec_plJ3nmyCDGBKInavdOK15jsl`, payload `{"event_type":"ping","data":{"success":true}}`, id `msg_loFOjxBNrRLzqYUf`, timestamp `1731705121` gives `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=` (it passes with the window off, and fails once you turn the window on).

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes bytes and breaks the HMAC. Use `express.raw({ type: '*/*' })`, `await request.text()` in Next.js, `await request.body()` in FastAPI.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the `whsec_...` string.
- **Several signatures.** The header may hold multiple `v1,` entries (key rotation). Accept if any matches.
- **Retries and replays keep the original timestamp.** A 5-minute window (the `svix` SDK's fixed default) rejects a Hookdeck retry or replay that arrives later, which is why the examples leave the window off by default.
- **If you use the `svix` SDK instead:** 2.x `verify()` returns nothing, so parse the JSON yourself, and it's ESM-only on npm.
- **No event ID in the payload.** Dedupe on `svix-id`.
- **Fail closed.** If `DAYTONA_WEBHOOK_SECRET` is unset, return 500 rather than skipping verification.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Missing `svix-*` headers | Request isn't from Daytona/Svix, or a proxy stripped headers |
| Signature always mismatches | Body parsed before verifying; secret not decoded; wrong endpoint's secret (each endpoint has its own) |
| "Message timestamp too old" | Server clock skew, or a replayed request |
| Works for some events only | Different endpoints (and secrets) per subscription |
