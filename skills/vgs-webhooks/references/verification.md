# VGS Webhook Signature Verification

## How Does VGS Sign Webhooks?

Each request carries one header:

```
vgs-signature: t=1623691785,v0=9370aa8513da0a14d21478f11f039708f7e664bfffebb939f574e57818ce08de
```

- `t`: UTC Unix timestamp in seconds
- `v0`: signature (scheme version 0)
- Algorithm: HMAC-SHA256, lowercase hex
- Key: the per-integration secret, as a UTF-8 string
- Signed message: `"<t>.<raw request body>"`

## Implementation

VGS provides no SDK for verification, so use the manual check in every framework.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
// compare with v0 using crypto.timingSafeEqual (check lengths first)
```

```python
expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
hmac.compare_digest(v0, expected)
```

Parse the header by splitting on `,` and each part on the first `=`.

## Replay Protection and Retries

The VGS docs example rejects a timestamp more than 60 seconds from now, and note that this is very strict: on a retry VGS sends the same timestamp, so a retry 30 minutes later would be rejected. Hookdeck retries and replays also keep the original timestamp.

The examples therefore **don't check the timestamp by default**. To opt in, set `VGS_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`). A value that isn't a whole number is treated as `0`, with a warning at startup. Use idempotency (see webhook-handler-patterns) to absorb replays instead.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`).
- **Content type:** use `express.raw({ type: '*/*' })` so any content type is read as raw bytes.
- **Secret:** use the integration's own secret; each integration has a different one.
- **No event header:** read the event name from the body's `event` field, after verifying.

## Debugging Verification Failures

- Confirm `VGS_WEBHOOK_SECRET` matches the integration that's delivering (no whitespace or quotes).
- Behind middleware that re-serialises JSON? The signature will fail.
- If only retries fail, you have a timestamp tolerance set; unset `VGS_TIMESTAMP_TOLERANCE_SECONDS` or raise it.
- Check the `t=` and `v0=` keys are both present; a missing key returns 400.
