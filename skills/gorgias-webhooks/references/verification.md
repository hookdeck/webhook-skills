# How to Verify Gorgias Webhooks

## Does Gorgias Sign Webhooks?

No. The Gorgias docs describe no signature header, no HMAC and no timestamp
for HTTP integrations. Authentication is whatever you configure:

| Mode | What Gorgias sends |
|---|---|
| **Header-based** | The headers you added, verbatim. E.g. `Authorization: Bearer <secret>` |
| **OAuth2** | A token it fetched from *your* token URL, in a header or the query string |
| **None** | Nothing. Don't do this for an endpoint that changes data |

> The Integration API schema lists an `http.hmac_secret` property ("The HMAC
> secret to use to sign HTTP calls to the external service"), but Gorgias
> documents no header name, algorithm or signed content for it. Don't build
> verification on it until it's documented.

## Header-Based Authentication (Recommended)

Configure the integration with the header `Authorization: Bearer <secret>`,
then compare the **entire** received header with `Bearer <secret>` in
constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyGorgiasAuthorization(header, secret) {
  if (!header || !secret) return false;
  const a = Buffer.from(String(header), 'utf8');
  const b = Buffer.from(`Bearer ${secret}`, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac

def verify_gorgias_authorization(header: str | None, secret: str) -> bool:
    if not header or not secret:
        return False
    return hmac.compare_digest(header.encode("utf-8"), f"Bearer {secret}".encode("utf-8"))
```

There's no Gorgias SDK with a webhook helper, so all three examples use these
functions.

### Using a Custom Header Instead

Any header name works. With `X-Gorgias-Secret: <secret>` configured in
Gorgias, read that header and compare it with the bare secret:

```javascript
verifyHeader(req.headers['x-gorgias-secret'], process.env.GORGIAS_WEBHOOK_SECRET);
// where verifyHeader does the same length-guarded timingSafeEqual
```

Header names are case-insensitive: Node lowercases them, and FastAPI's
`Header()` maps `x_gorgias_secret` to `X-Gorgias-Secret`.

## OAuth2 Mode

With **Enable authentication method: OAuth2**, you give Gorgias a **Token
URL**, **Client ID**, **Client Secret**, optional **Scopes**, a **Token
Location** (Header or Query String) and a **Token Key** (the header or query
parameter name). Gorgias gets a token from your token URL and attaches it to
each request.

Validate that token the way you'd validate any access token your
authorization server issued (JWT signature and claims, or introspection).
The examples don't implement this.

OAuth2 integrations get one extra reliability benefit: Gorgias retries
requests that **time out**, which header-auth integrations don't get.

## Common Gotchas

- **Compare the full header value.** `Bearer ` is part of what you
  configured in Gorgias, so build `Bearer <secret>` and compare the whole
  string. Comparing the whole value means any typo in the Gorgias header
  shows up as a 401 rather than being silently tolerated.
- **Don't use `===`.** A plain string comparison leaks timing information.
  Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
- **Fail closed.** If `GORGIAS_WEBHOOK_SECRET` isn't set, reject the
  request (the examples return 500) rather than accepting everything.
- **No replay protection.** There's no timestamp or nonce. Anyone holding a
  captured request can resend it. Use HTTPS and make handlers idempotent.
- **Authenticate before parsing.** The examples read the raw body and only
  parse it (JSON or form data) after the header check passes.
- **Check the method.** Gorgias can call you with `POST`, `PUT`, `PATCH` or
  `DELETE`. A route that only handles `POST` returns 404/405 for the others,
  and Gorgias won't retry.
- **Answer within 5 seconds.** Slow handlers time out, and header-auth
  integrations aren't retried on timeout.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---|---|
| 401 `Missing Authorization header` | The header isn't configured on the integration, or it's under a different name |
| 401 `Invalid Authorization header` | Secret mismatch, missing `Bearer ` prefix, or stray whitespace in the Gorgias header value |
| 500 `Webhook authentication not configured` | `GORGIAS_WEBHOOK_SECRET` isn't set in your app |
| 400 `Invalid JSON` | The rendered template isn't valid JSON, e.g. a variable value contains `"` |
| 404/405 | The integration uses a method your route doesn't handle |

Open the request in the integration's **Events** tab (or the Hookdeck CLI
web UI) to see exactly which headers and body arrived.
