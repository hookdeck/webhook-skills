# How to Authenticate Estuary Webhooks

## How It Works

Estuary **does not sign requests**: no HMAC, no signature header, no timestamp. You add a
secret header to the materialization trigger (or the HTTP Webhook connector's custom headers)
and compare it on receipt. This is also what Hookdeck's Estuary source does: API key
verification with a header name and the exact, whole header value.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection.** Anyone who captures one request can replay it. Use HTTPS, keep the value secret
and rotate it if it leaks.

Rules that cause most failures:

- The header name is whatever you configured (`ESTUARY_WEBHOOK_HEADER`, default `Authorization`).
  Look it up case-insensitively.
- Compare the **whole value**. If you typed `Bearer my-secret-token`, that full string is the
  secret. Do not strip or parse the `Bearer ` prefix.
- Missing header or mismatch: `401`. Reject everything if the secret is unconfigured.
- Check it first for **every** method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), and before
  parsing the body. Handle an empty body.

## Implementation

There is no SDK. Verification is a constant-time comparison. Header strings arrive decoded as
Latin-1, so re-encode the received value as Latin-1 (the wire bytes) and the configured secret as UTF-8.

### Node.js (Express)

```javascript
const crypto = require('crypto');
const digest = (buf) => crypto.createHash('sha256').update(buf).digest();

function verifyEstuaryRequest(headers, env = process.env) {
  const expected = env.ESTUARY_WEBHOOK_SECRET;
  if (!expected) return false;
  const name = (env.ESTUARY_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  if (!received) return false;
  return crypto.timingSafeEqual(
    digest(Buffer.from(received, 'latin1')), digest(Buffer.from(expected, 'utf8')));
}

app.all('/webhooks/estuary', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyEstuaryRequest(req.headers)) return res.status(401).end();
  // parse req.body only after this point
});
```

### Next.js (App Router)

```typescript
const received = request.headers.get(name); // Headers is case-insensitive
// same digest + timingSafeEqual as above; export GET, POST, PUT, PATCH and DELETE
```

### Python (FastAPI)

```python
import hmac

def safe_equal(received: str, expected: str) -> bool:
    # bytes on both sides: compare_digest raises TypeError for non-ASCII str
    return hmac.compare_digest(received.encode("latin-1"), expected.encode("utf-8"))

# request.headers.get(name) is case-insensitive; use @app.api_route(path, methods=[...])
```

## Common Gotchas

- **Prefix stripping**: don't. Store the whole header value, `Bearer ` and all.
- **Wrong header name**: set `ESTUARY_WEBHOOK_HEADER` to the name you configured. Don't assume `Authorization`.
- **Unconfigured secret**: an empty `ESTUARY_WEBHOOK_SECRET` must never match an empty header.
- **Non-POST methods**: triggers can use `PUT` or `PATCH`; a POST-only route returns 405.
- **Empty bodies**: handle them (a `GET`/`DELETE` or a template that renders nothing).
- **Raw body**: `express.raw({ type: '*/*' })` accepts any content type; parse after the check.
- **Hookdeck**: the Estuary source verifies the same header and value. Allow `PUT`/`PATCH` on it if your trigger uses them.

## Debugging 401s

1. Log which header names arrive (`Object.keys(req.headers)`), never the values.
2. Confirm the header you configured in Estuary is present, then compare lengths of the
   received and configured values (a missing `Bearer ` shows as a 7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the header was saved on the trigger (or connector) that is actually firing.
