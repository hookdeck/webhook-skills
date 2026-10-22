# How to Authenticate Speechmatics Webhooks

## How It Works

Speechmatics notifications **are not signed**: there is no HMAC, timestamp or signature header.
Authenticity comes from a header you define on the job:

| `notification_config` field | What arrives on the callback |
|-----------------------------|------------------------------|
| `"auth_headers": ["X-Speechmatics-Secret: abc123"]` | header `X-Speechmatics-Secret: abc123` |
| `"auth_headers": ["Authorization: Bearer abc123"]` | header `Authorization: Bearer abc123` |

Both name and value are yours to choose, so the examples read the name from
`SPEECHMATICS_WEBHOOK_HEADER` (default `Authorization`) and the expected value from
`SPEECHMATICS_WEBHOOK_SECRET`. The value is compared **whole**: if you registered
`Authorization: Bearer abc123`, set the secret to `Bearer abc123`. Don't strip or parse a
`Bearer ` prefix. Hookdeck's Speechmatics source works the same way (header name plus exact value).

## What This Does and Doesn't Prove

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp. Anyone who captures one
request can replay it, and anyone who learns the credential can forge requests. So:

- Serve the endpoint over HTTPS only.
- Rotate the credential if it leaks (submit new jobs with the new value).
- Treat bodies as untrusted input; if you need the authoritative result, fetch it from the
  Speechmatics API by job `id`.
- Make handlers idempotent on the job `id` (callbacks can repeat after non-2xx responses).
- Optionally allowlist Speechmatics' egress IPs as well.

## Implementation

There is no SDK helper; verification is a constant-time string comparison.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

// Hash both sides so the buffers are equal length: timingSafeEqual can't throw
// and the secret's length isn't revealed.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifySpeechmaticsRequest(headers, name, expected) {
  if (!expected) return false;
  const received = headers[(name || 'Authorization').toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && safeEqual(received, expected);
}
```

In Next.js use `request.headers.get(name)`, which is case-insensitive.

### Python (FastAPI)

```python
import hmac

def verify_speechmatics_request(headers, name, expected) -> bool:
    if not expected:
        return False
    received = headers.get((name or "Authorization").lower())
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return received is not None and hmac.compare_digest(
        received.encode("utf-8"), expected.encode("utf-8")
    )
```

In FastAPI, wrap this in a dependency (`Depends(require_speechmatics_auth)`) so the route never
runs, and the body is never read, for unauthenticated requests.

## Common Gotchas

- **Compare the whole value.** `Bearer abc123` and `abc123` are different values.
- **Lowercase the header name** before looking it up in Node's `req.headers`.
- **Authenticate before reading the body.** Callbacks can carry media files, so check the header
  first, then read the body raw (Express: `express.raw({ type: '*/*' })`). Parse JSON only after
  the check, and only if the content type says JSON.
- **Accept POST and PUT.** The method is set per notification.
- **The body may be empty.** A notification with no `contents` is just a request with
  `?id=...&status=...`.
- **A 401 is retried.** Speechmatics retries any non-2xx response until its timeout, so a
  misconfigured secret produces repeated failed attempts; the job's `errors` array records them.
  The transcript stays available from the API.
- **413 is retried too.** Raise your server's body limit if you request `data` or large transcripts.
- **Never accept when unconfigured.** An empty secret must reject.
- **Don't log the header value.**

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every delivery | The job's `auth_headers` is missing or differs from `SPEECHMATICS_WEBHOOK_SECRET` |
| Secret set to the token, header is `Authorization: Bearer ...` | The secret must include the `Bearer ` prefix |
| 401 only locally | The tunnel or proxy strips or renames the header; compare against the Hookdeck request log |
| Header present but rejected | Trailing whitespace or quotes in `.env` values |
| `GET /jobs/{id}` shows `Response status: 401` errors | Your endpoint rejected the callback; fix the secret and resubmit |
