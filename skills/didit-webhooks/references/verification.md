# How to Verify Didit Webhook Signatures

## How It Works

Every webhook is signed with HMAC-SHA256 keyed with the destination's `secret_shared_key` (a raw string). Didit sends three signature headers:

| Header | What is signed | Notes |
|--------|----------------|-------|
| `X-Signature` | The exact raw request bytes | Hex digest. Needs the raw body before any parser touches it |
| `X-Signature-V2` | Sorted-key, compact, Unicode-preserved JSON (`ensure_ascii=False`) | Survives middleware that re-encodes the body |
| `X-Signature-Simple` | `"{timestamp}:{session_id}:{status}:{webhook_type}"` | **Deprecated.** Covers the envelope only, not `decision` |

`X-Timestamp` (unix seconds) is a separate header and is **not** part of any `X-Signature` input. Didit recommends rejecting requests where `abs(now - X-Timestamp) > 300`, and refreshes it on each of its own retries. A gateway such as Hookdeck re-sends the original header on its retries and replays, so the examples leave the check off by default; set `DIDIT_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to opt in. A value that isn't a whole number is treated as `0`, with a warning at startup.

This skill uses `X-Signature` over the raw body as the primary path, which is also what Hookdeck's Didit source verifies.

## Implementation

Didit has no webhook verification SDK. Verify manually.

### Node.js

```javascript
const crypto = require('crypto');

// toleranceSec = 0 (default) skips the X-Timestamp check; a positive value opts in
function verify(rawBody, signature, timestamp, secret, toleranceSec = 0, now = Math.floor(Date.now() / 1000)) {
  if (!signature) return false;
  if (toleranceSec > 0 && !(Math.abs(now - Number(timestamp)) <= toleranceSec)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Express: `app.post('/webhooks/didit', express.raw({ type: '*/*' }), handler)`. Next.js: `await request.text()`.

### Python

```python
import hmac, hashlib, time

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str, tolerance: int = 0) -> bool:
    # tolerance = 0 (default) skips the X-Timestamp check; a positive value opts in
    if not signature:
        return False
    if tolerance > 0 and (not timestamp or not timestamp.isdigit() or abs(time.time() - int(timestamp)) > tolerance):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)
```

FastAPI: `await request.body()`.

### Alternative: X-Signature-V2

Use it only if middleware you can't remove re-encodes the body (for example turning `José` into `José`). Parse the JSON, normalise whole-valued floats to ints, re-serialize with sorted keys, compact separators and unescaped Unicode, then HMAC-SHA256 that string:

```python
canonical = json.dumps(shorten_floats(body), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
expected = hmac.new(secret.encode(), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
```

Reproducing the canonical form is error-prone in other languages (PHP needs `JSON_UNESCAPED_SLASHES`, `JSON_UNESCAPED_UNICODE`, string-wise key sort and non-associative decoding). See [Didit's code samples](https://docs.didit.me/integration/webhooks#code-samples).

If you can only verify `X-Signature-Simple`, treat everything outside `timestamp`, `session_id`, `status` and `webhook_type` as untrusted and re-fetch the decision from `GET /v3/session/{session_id}/decision/`.

## Common Gotchas

- **Raw body.** `express.json()` or `request.json()` before verifying changes the bytes, and `X-Signature` fails
- **Unicode escapes.** `X-Signature` covers Didit's `ensure_ascii=True` output (`é`), so never re-serialize before checking it
- **Timestamp isn't signed.** Anyone who can replay a request can also change `X-Timestamp`, so the window adds little. The examples skip it unless `DIDIT_TIMESTAMP_TOLERANCE_SECONDS` is positive
- **Replays through a gateway.** A gateway such as Hookdeck re-sends the stored request with its original headers, so a retry or replay after the window has passed carries a stale `X-Timestamp` and fails a 300 second check (only Didit's own retries get a fresh one). That's why the check is off by default
- **Secret is per destination.** A different destination has a different `secret_shared_key`
- **Hex digest.** Compare hex strings, not base64, and guard the length before `timingSafeEqual`
- **Idempotency.** Key on `event_id`, which is reused across retries and destinations

## Debugging Verification Failures

1. Confirm `DIDIT_WEBHOOK_SECRET` is the secret of the destination that sent the request
2. Log the raw body length and check it matches the request's content length
3. Check no body-parsing middleware ran first on this route
4. Check clock skew if the error is the timestamp
5. Send a **Try Webhook** sample and compare your computed digest to `X-Signature`
