# How to Verify Zapier Webhooks

## Does Zapier Sign Webhook Requests?

No. Requests from the **Webhooks by Zapier** action carry no signature header, no HMAC and no Zapier-issued secret. Authenticate them with a credential you configure in the Zap:

| Method | Set in the Zap | Your endpoint checks |
|--------|----------------|----------------------|
| Shared-secret header | **Headers**: `X-Webhook-Secret` = your secret | `X-Webhook-Secret` equals `ZAPIER_WEBHOOK_SECRET` |
| Basic Auth | **Basic Auth**: `username|password` | `Authorization: Basic base64(username:password)` matches `ZAPIER_BASIC_AUTH_USERNAME` / `ZAPIER_BASIC_AUTH_PASSWORD` |

`X-Webhook-Secret` is a naming convention, not a Zapier header; any header name works as long as both sides agree.

## Implementation

There is no Zapier SDK for this. The comparison is a few lines in each language.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash first: equal-length buffers, so timingSafeEqual can't throw or leak length
  const h = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

function verifySecretHeader(headerValue, secret) {
  return Boolean(secret) && safeEqual(headerValue, secret);
}

function verifyBasicAuth(authorization, username, password) {
  if (!username || !password || typeof authorization !== 'string') return false;
  const m = authorization.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1].trim(), 'base64').toString('utf8');
  return safeEqual(decoded, `${username}:${password}`);
}
```

### Python (FastAPI)

```python
import base64, binascii, hashlib, hmac

def safe_equal(a, b):
    if a is None:
        return False
    # Hash first so the compare doesn't leak the secret's length
    h = lambda s: hashlib.sha256(s.encode()).digest()
    return hmac.compare_digest(h(a), h(b))

def verify_secret_header(header_value, secret):
    return bool(secret) and safe_equal(header_value, secret)

def verify_basic_auth(authorization, username, password):
    if not (authorization and username and password):
        return False
    scheme, _, encoded = authorization.partition(" ")
    if scheme.lower() != "basic":
        return False
    try:
        decoded = base64.b64decode(encoded.strip(), validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        return False
    return safe_equal(decoded, f"{username}:{password}")
```

### Combining the two

The examples accept whichever configured method the request uses, and **fail closed** when neither is configured:

- No credentials configured → `500` (never "accept everything")
- Credential missing or wrong → `401`
- Authenticated but malformed JSON → `400`
- Otherwise → `200`

Authenticate **before** parsing the body, so unauthenticated callers can't reach your parser.

## Common Gotchas

- **Don't use `===` / `==`.** A plain string compare can leak timing. Use `crypto.timingSafeEqual` or `hmac.compare_digest`.
- **Unequal lengths.** `timingSafeEqual` throws on them, and `hmac.compare_digest` can reveal the secret's length. Hash both sides with SHA-256 first, as above.
- **Passwords can contain `:`.** Compare the whole decoded `username:password` string instead of splitting on the first colon.
- **Basic Auth field uses a pipe.** Enter `username|password` in Zapier, not `username:password`. Because `|` is the separator, the username and password must not contain `|`.
- **Empty env vars.** An unset secret must not match an empty or missing header. The examples treat "not configured" as a `500`.
- **No raw-body requirement.** Nothing is signed, so normal body parsers are fine. Do handle every Payload Type you use (JSON, Form, or raw text).
- **No replay protection.** Zapier sends no timestamp or delivery ID. If duplicates matter, add your own ID field in Data (e.g. the trigger record's ID) and dedupe on it.

## Debugging Authentication Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Header name typo in the Zap, extra whitespace in the value, or a different secret in your env |
| `401` with Basic Auth | Used `:` instead of `|` in the Zap's Basic Auth field, or the username/password env vars are swapped |
| `500` "not configured" | `ZAPIER_WEBHOOK_SECRET` (or both Basic Auth vars) not loaded; check `.env` |
| `400` invalid body | Payload Type is JSON but a Custom Request Data field has invalid JSON |
| Unexpected fields | Data section left blank, so Zapier sent every field from the previous step |

## What About Zapier White-Label Connection Webhooks?

Zapier's white-label / embedded connection webhooks are a separate product and **are** signed, using [Standard Webhooks](https://www.standardwebhooks.com/):

- Headers: `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<base64>`)
- Signed content: `{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256
- Secret: `whsec_` prefix + base64 key (decode the part after the prefix to get the HMAC key)

Use the `standardwebhooks` package (Node or Python) with the **raw** body. The [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) skill shows the same scheme end to end.
