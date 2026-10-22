# How to Authenticate AssemblyAI Webhooks

## How It Works

AssemblyAI webhooks **are not signed**: there is no HMAC, timestamp or signature header.
Authenticity comes from a custom header that you define when creating the transcript:

| Transcript request field | What arrives on the webhook |
|--------------------------|-----------------------------|
| `webhook_auth_header_name` = `X-My-Webhook-Secret` | a header with that name |
| `webhook_auth_header_value` = `secret-value` | carrying that exact value |

Both name and value are yours to choose, so the examples read them from
`ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME` and `ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE`. Hookdeck's
AssemblyAI source takes the same two inputs.

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

function verifyAssemblyAIRequest(headers, name, expected) {
  if (!name || !expected) return false;
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return typeof received === 'string' && safeEqual(received, expected);
}
```

In Next.js use `request.headers.get(name)`, which is case-insensitive.

### Python (FastAPI)

```python
import hashlib, hmac

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

def verify_assemblyai_request(headers, name, expected) -> bool:
    if not name or not expected:
        return False
    received = headers.get(name.lower())
    return received is not None and safe_equal(received, expected)
```

In FastAPI, wrap this in a dependency (`Depends(require_assemblyai_auth)`) so the route never
runs for unauthenticated requests.

## Common Gotchas

- **Lowercase the header name** before looking it up in Node's `req.headers`.
- **Use the raw body, any content type.** There's nothing to sign, but the Express example
  reads `express.raw({ type: '*/*' })` so a delivery verifies whatever `Content-Type` it carries.
- **A 401 is final.** AssemblyAI treats any 4xx as a failed delivery and does not retry, so a
  misconfigured secret loses the notification. Fetch the transcript by ID (or check
  `webhook_status_code`) to recover.
- **Respond within 10 seconds.** Do slow work after returning 200.
- **Retries can repeat a delivery.** After a timeout or 5xx AssemblyAI retries up to 10 times,
  10 seconds apart. Make handlers idempotent on `transcript_id`.
- **Never accept when unconfigured.** Empty name or value must reject.
- **Don't log the header value.**
- The sender IPs (`44.238.19.20`, `54.220.25.36`) can be allowlisted as an extra, not instead.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every delivery | The transcript request omitted `webhook_auth_header_name`/`_value`, or they differ from your `.env` |
| 401 only locally | The tunnel or proxy strips or renames custom headers; compare against the Hookdeck request log |
| Header present but rejected | Trailing whitespace or quotes in `.env` values |
| Verification works with curl, not AssemblyAI | Header name lookup is case-sensitive in your code |
