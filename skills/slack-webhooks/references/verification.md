# Slack Signature Verification

## How It Works

Slack signs every Events API request with **HMAC-SHA256** using your app's
**Signing Secret**. The result arrives in two headers:

| Header | Value |
|--------|-------|
| `X-Slack-Request-Timestamp` | Unix epoch seconds, e.g. `1531420618` |
| `X-Slack-Signature` | `v0=<hex>` — the version prefix is part of the value |

The string that gets signed is the literal concatenation:

```
v0:{timestamp}:{raw_body}
```

The version (`v0`), the timestamp from the `X-Slack-Request-Timestamp` header,
and the **raw request body** are joined with literal colons. The output is then
hex-encoded and prefixed with `v0=` for comparison against `X-Slack-Signature`.

## Verification Steps

1. Read `X-Slack-Signature` and `X-Slack-Request-Timestamp`. Reject if either is missing.
2. Reject if the timestamp differs from local time by more than **5 minutes** (replay protection).
3. Build the basestring `v0:{timestamp}:{raw_body}` using the **raw** request body — do not parse JSON first.
4. Compute `v0=` + HMAC-SHA256(signing_secret, basestring).hex().
5. Compare to `X-Slack-Signature` with a **timing-safe** comparison.

## Implementation

### Node.js / Express / Next.js

```javascript
const crypto = require('crypto');

function verifySlackRequest(rawBody, signatureHeader, timestampHeader, signingSecret) {
  if (!signatureHeader || !timestampHeader || !signingSecret) return false;

  const timestamp = parseInt(timestampHeader, 10);
  if (Number.isNaN(timestamp)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60 * 5) return false;

  const basestring = `v0:${timestamp}:${rawBody}`;
  const expected = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(basestring, 'utf8')
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python / FastAPI

```python
import hmac
import hashlib
import time

def verify_slack_request(raw_body: bytes, signature_header: str, timestamp_header: str, signing_secret: str) -> bool:
    if not signature_header or not timestamp_header or not signing_secret:
        return False

    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False

    if abs(time.time() - timestamp) > 60 * 5:
        return False

    basestring = f"v0:{timestamp}:{raw_body.decode('utf-8')}".encode("utf-8")
    expected = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body.** If you let Express or FastAPI parse JSON first and then
  re-stringify it, whitespace and key ordering will differ from what Slack
  signed, and the signature will not match. Always feed the original `Buffer` /
  `bytes` into HMAC.
- **The signature header includes the `v0=` prefix.** Compare the full string
  `v0=<hex>` — don't strip the prefix on only one side.
- **The timestamp is part of the signed string.** Slack uses the timestamp from
  `X-Slack-Request-Timestamp`, not the current time. Don't substitute
  `Date.now()` when building the basestring.
- **Reject stale timestamps (>5 minutes old)** to prevent replay attacks. Keep
  your server clock in sync (NTP).
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`). A normal `===` leaks information through timing.
- **Slack will retry on timeout.** Make sure to return `200` within 3 seconds,
  and deduplicate using `event_id` since the same event may arrive 1-3 times.
- **The Bolt SDK does verification for you.** If you adopt
  [`@slack/bolt`](https://tools.slack.dev/bolt-js), it handles signing-secret
  verification, the URL challenge, and the 3-second ack. Use Bolt if you want
  the full Slack app framework; use manual verification (this skill) for a
  framework-agnostic webhook receiver.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| All signatures fail, including from real Slack | Body is being parsed/re-stringified before signing. Use the raw `Buffer`/`bytes`. |
| Off-by-one mismatch | Forgot the `v0=` prefix on the computed signature. |
| Random failures only sometimes | Server clock drift. Sync NTP; 5-minute window is tight. |
| Tests fail with "Cannot read property of undefined" | Header lookup is case-sensitive in your framework. Slack sends lowercase. |
| Works in dev, fails in production | Production uses a different signing secret. Each app has its own. |
