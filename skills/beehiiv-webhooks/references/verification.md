# How to Verify beehiiv Webhook Signatures

## How Does beehiiv Sign Webhooks?

beehiiv delivers webhooks through Svix. The scheme is [Standard Webhooks](https://www.standardwebhooks.com/) with `svix-*` header names:

| Item | Value |
|------|-------|
| Headers | `svix-id`, `svix-timestamp`, `svix-signature` |
| Algorithm | HMAC-SHA256, base64 output |
| Signed content | `{svix-id}.{svix-timestamp}.{raw body}` |
| Key | base64-**decode** the part of the secret after `whsec_` |
| `svix-signature` | One or more space-separated `v1,<base64>` entries; any match is valid |
| Timestamp | Unix seconds |
| Secret | Endpoint signing secret from **Settings > Webhooks** (`BEEHIIV_WEBHOOK_SECRET`) |

## SDK Verification (Recommended)

```javascript
import { Webhook } from 'svix';

new Webhook(process.env.BEEHIIV_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': req.get('svix-id'),
  'svix-timestamp': req.get('svix-timestamp'),
  'svix-signature': req.get('svix-signature'),
}); // throws on failure
const event = JSON.parse(rawBody);
```

```python
from svix.webhooks import Webhook

Webhook(secret).verify(raw_body, {
    "svix-id": request.headers["svix-id"],
    "svix-timestamp": request.headers["svix-timestamp"],
    "svix-signature": request.headers["svix-signature"],
})  # raises WebhookVerificationError
```

`svix` 2.x on npm is ESM-only and `verify()` returns nothing, so parse the JSON yourself after it passes.

The library **always enforces a fixed 5-minute timestamp window**. Hookdeck retries and replays resend the original `svix-timestamp`, so the library rejects them once they are more than 5 minutes old.

## Manual Verification (no timestamp window)

Use this when you need to accept late retries or replays, or want a window you control. Set `toleranceSec` to `0` for no window, or to a wider value.

```javascript
import crypto from 'node:crypto';

function verifyBeehiivWebhookManual(rawBody, headers, secret, toleranceSec = 0) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigs = headers['svix-signature'];
  if (!id || !/^[1-9]\d*$/.test(ts ?? '') || !sigs) throw new Error('Missing or malformed svix-* headers');
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) {
    throw new Error('Timestamp outside tolerance');
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); // decode; don't use the string as-is
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(`${id}.${ts}.`).update(rawBody).digest('base64'));
  const ok = sigs.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    const given = Buffer.from(sig ?? ''); // compare the base64 text, as Svix and Hookdeck do
    return version === 'v1' && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error('Invalid signature');
  return JSON.parse(rawBody.toString('utf8'));
}
```

```python
import base64, hashlib, hmac, time

def verify_beehiiv(raw_body: bytes, headers, secret: str, tolerance: int = 0) -> None:
    # tolerance = 0 skips the timestamp window; a positive value opts in
    msg_id, ts, sigs = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not (msg_id and ts and ts.isascii() and ts.isdigit() and not ts.startswith("0") and sigs):
        raise ValueError("Missing or malformed svix-* headers")
    if tolerance > 0 and abs(time.time() - int(ts)) > tolerance:
        raise ValueError("Timestamp outside tolerance")
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest())
    for entry in sigs.split(" "):
        version, _, sig = entry.partition(",")
        # compare the base64 text, as Svix and Hookdeck do (no lenient decoding)
        if version == "v1" and hmac.compare_digest(sig.encode(), expected):
            return
    raise ValueError("Invalid signature")
```

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes bytes and breaks the HMAC. Use `express.raw({ type: '*/*' })`, `await request.text()` in Next.js, `await request.body()` in FastAPI.
- **Decode the secret.** The HMAC key is the base64-decoded bytes after `whsec_`, not the `whsec_...` string.
- **Several signatures.** The header can hold more than one `v1,` entry. Accept if any matches.
- **Retries and replays keep the original timestamp.** The `svix` library's fixed 5-minute window rejects late ones; use the manual verifier if that matters.
- **One secret per endpoint.** Each endpoint has its own signing secret.
- **Fail closed.** If `BEEHIIV_WEBHOOK_SECRET` is unset, return 500 rather than skipping verification.
- **Status codes.** Missing headers or a bad signature: 400 (401 also works).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Missing `svix-*` headers | Request isn't from beehiiv/Svix, or a proxy stripped headers |
| Signature always mismatches | Body parsed before verifying; secret not decoded; wrong endpoint's secret |
| "Message timestamp too old" | Late Hookdeck retry or replay, a replayed capture, or server clock skew |
| Works for some endpoints only | Different endpoints have different secrets |
