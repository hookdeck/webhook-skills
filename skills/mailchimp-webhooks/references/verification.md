# Securing Mailchimp Webhooks (No Signature)

## Why There's No Signature to Verify

**Mailchimp does not sign its webhooks.** There is no HMAC, no `X-Mailchimp-*`
signature header, and no shared signing secret to compute against. If you see
example code computing an HMAC for Mailchimp, it is wrong — Mailchimp never
documented or shipped webhook signatures.

Instead, Mailchimp's [webhooks guide](https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/)
recommends two complementary protections:

1. Serve the endpoint over **HTTPS**.
2. Put an **unguessable secret in the webhook URL** and validate it on each request.

This skill implements both, plus the required GET URL-validation response.

## How It Works

### 1. Respond to the GET URL validation

When you save a webhook, Mailchimp sends a `GET` to the callback URL to check it
is reachable. Return `200`. Do **not** require the secret on the GET — treat it
as a liveness probe:

```javascript
app.get('/webhooks/mailchimp', (req, res) => res.status(200).send('OK'));
```

### 2. Validate the URL secret on every POST (timing-safe)

You registered the URL as `…/webhooks/mailchimp?secret=<value>`. On each POST,
compare the `secret` query parameter to your stored secret using a constant-time
comparison so an attacker can't brute-force it character-by-character via timing.

**Node (manual, no SDK — Mailchimp has no webhook-verification SDK):**

```javascript
const crypto = require('crypto');

function verifyMailchimpSecret(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;   // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

// Usage in an Express handler:
if (!verifyMailchimpSecret(req.query.secret, process.env.MAILCHIMP_WEBHOOK_SECRET)) {
  return res.status(401).send('Unauthorized');
}
```

**Python (manual):**

```python
import hmac

def verify_mailchimp_secret(provided: str, expected: str) -> bool:
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)  # constant-time
```

### 3. Parse the form-encoded body

Mailchimp sends `application/x-www-form-urlencoded`, with nested data in bracket
notation (`data[merges][FNAME]`). Parse it into a nested object, then dispatch on
the top-level `type` field:

```javascript
// "data[merges][FNAME]=x" -> { data: { merges: { FNAME: 'x' } } }
function parseFormData(searchParams) {
  const result = {};
  for (const [rawKey, value] of searchParams) {
    const path = rawKey.replace(/\]/g, '').split('[');
    let node = result;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
      node = node[k];
    }
    node[path[path.length - 1]] = value;
  }
  return result;
}
```

## Response Status Codes

| Situation | Status |
|-----------|--------|
| GET URL validation | `200` |
| POST with valid secret, handled | `200` |
| POST with missing or wrong secret | `401` |
| POST with unexpected server error | `500` |

Return `2xx` quickly for accepted events; do heavy work asynchronously so you
stay under Mailchimp's ~10 second timeout.

## Common Gotchas

- **Don't compute an HMAC.** There is no signature — verify the URL secret instead.
- **Always HTTPS.** The secret is in the URL; HTTP would leak it in transit and logs.
- **GET must return 200** or Mailchimp won't save the webhook. Don't gate the GET on the secret.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, not `===`.
- **Length mismatch throws.** `crypto.timingSafeEqual` throws if buffer lengths differ — guard the length first (shown above).
- **Bracketed keys are literal** in most form parsers. Express with `extended: true` (the `qs` parser) nests them automatically; for raw parsing (Next.js, FastAPI) reconstruct the nesting yourself.
- **Scrub the secret from logs.** Query strings often end up in access logs.

## Debugging Verification Failures

- **Always 401:** The `secret` query param isn't reaching your handler, or it
  doesn't match `MAILCHIMP_WEBHOOK_SECRET`. Log `Object.keys(req.query)` (not the
  value) and confirm the registered URL includes `?secret=…`.
- **Mailchimp won't save the webhook:** Your GET handler isn't returning `200`,
  the URL isn't public/HTTPS, or it responds too slowly.
- **`data` fields are `undefined`:** You're reading flat keys like
  `data[id]` instead of nesting them — parse the bracket notation first.
