# PostHog Signature Verification

## How Does PostHog Sign Webhooks?

PostHog follows [Standard Webhooks](https://www.standardwebhooks.com) (source: [`standard-webhooks.ts`](https://github.com/PostHog/posthog/blob/master/nodejs/src/cdp/utils/standard-webhooks.ts)):

- Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`
- Signed content: `<webhook-id>.<webhook-timestamp>.<raw body>`
- Algorithm: HMAC-SHA256, key = base64-decoded secret (optional `whsec_` prefix stripped, at least 24 bytes), output base64
- Header value: `v1,<base64>`
- Signing happens only if the destination has a **Signing secret**. PostHog refuses to send unsigned if the secret is invalid.
- `webhook-id` stays constant across retries; the timestamp and signature are regenerated on each PostHog attempt.

## Implementation

### Library (recommended)

Node: `new Webhook(secret).verify(rawBody, headers)` from `standardwebhooks`. Python: `Webhook(secret).verify(raw_body, headers)` from `standardwebhooks.webhooks`. See the three `examples/` projects.

### Manual Verification (configurable timestamp window)

The libraries always enforce a fixed 5-minute window. Hookdeck retries and replays resend the original timestamp, so late retries fail. This verifier lets you drop (`0`) or widen the window; deduplicate on `webhook-id` instead.

```javascript
const crypto = require('crypto');

// toleranceSeconds: 0 disables the timestamp check
function verifyPostHog(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !ts || !sigHeader) return false;

  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64')
  );

  // Header may hold several space-separated "v1,<base64>" entries
  return sigHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    // Compare the base64 strings; Buffer.from(sig, 'base64') silently skips invalid characters
    const actual = Buffer.from(sig);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  });
}
```

Python equivalent: `hmac.new(base64.b64decode(secret.removeprefix("whsec_")), f"{id}.{ts}.{body}".encode(), hashlib.sha256).digest()`, base64 encode, compare with `hmac.compare_digest`.

## Common Gotchas

- **Raw body**: verify the exact bytes received. In Express use `express.raw({ type: '*/*' })` so any content type is verified, not just `application/json`.
- **Secret format**: use `whsec_<base64>`. A bare base64 secret signs fine in PostHog but fails Hookdeck.
- **Same string everywhere**: the value in PostHog must match the receiver exactly.
- **Short secrets**: under 24 decoded bytes, PostHog refuses to send.
- **Timestamp window**: libraries reject anything older than 5 minutes, including Hookdeck retries and replays.
- **Body shape**: the body is the destination template, so verify first, then dispatch on `event.event`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `Missing required headers` | No signing secret set in PostHog |
| `No matching signature found` | Different secret, bare vs `whsec_` form mismatch, or body parsed/re-serialized |
| `Message timestamp too old` | Retry or replay after 5 minutes; use the manual verifier |
| Works direct, fails via Hookdeck | Secret not in `whsec_` form on the Hookdeck source |
