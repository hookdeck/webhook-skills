# How to Authenticate Make HTTP Module Requests

## How It Works

Make's HTTP module **does not sign requests**: there is no HMAC, timestamp or signature
header. Authenticity comes from a secret header that the module adds through its **API key**
keychain:

| Keychain field | Effect |
|----------------|--------|
| **Key** | The header value, sent exactly as entered (including any `Bearer ` / `Token ` prefix) |
| **API key placement** | `In the header` (use this) or in the query parameters |
| **API key parameter name** | The header name, e.g. `Authorization`, `x-api-key` |

The examples read the header name from `MAKE_WEBHOOK_HEADER` (default `Authorization`) and
the expected value from `MAKE_WEBHOOK_SECRET`, and compare the **whole** value. They don't
strip or parse a `Bearer ` prefix: if you typed `Bearer abc` in Make, set
`MAKE_WEBHOOK_SECRET=Bearer abc`. This is also how Hookdeck's Make source verifies (header
name plus exact value).

## What a Static Credential Does and Doesn't Give You

A static shared credential authenticates the **sender**, not the **body**. Nothing binds the
key to the payload, and there is no timestamp, so it gives **no replay protection**: anyone who
captures one request can resend it, or send a different body with the same header.

- Use HTTPS only (Make requires it).
- Rotate the key if it leaks: edit it under **Keys** in Make and update `MAKE_WEBHOOK_SECRET`.
- Put a unique `id` in the body and dedupe on it if replays matter.

## Implementation

There's no SDK; verification is a constant-time string comparison.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyMakeRequest(headers, expected, headerName = 'authorization') {
  if (!expected) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && safeEqual(received, expected);
}
```

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_make_request(headers, expected, header_name="Authorization") -> bool:
    if not expected:
        return False
    wanted = header_name.lower()  # header names are case-insensitive
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return received is not None and safe_equal(received, expected)
```

In FastAPI, wrap this in a dependency (`Depends(require_make_auth)`) so the route never runs
for unauthenticated requests.

## Common Gotchas

- **Don't use `===` / `==`.** Plain string comparison returns early on the first differing
  character. Use `crypto.timingSafeEqual` / `hmac.compare_digest`.
- **`timingSafeEqual` throws on unequal lengths.** Hash both values first (as above) or check
  the lengths.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Compare bytes.
- **Compare the whole value.** Don't strip `Bearer `: the Key is sent as entered, so the
  expected value must include whatever prefix you typed.
- **Header case.** HTTP header names are case-insensitive; Express lowercases them, Next.js
  `Headers` and Starlette look them up case-insensitively.
- **Empty secret.** If `MAKE_WEBHOOK_SECRET` is unset, reject everything. Never compare
  against an empty string.
- **Query placement.** If the key is placed in the query string it never reaches the header
  check. Use **In the header**.
- **Not POST-only.** The method is user-chosen; accept POST, PUT, PATCH, DELETE and GET, and
  handle an empty body.
- **Authenticate before parsing.** Read the raw body, check the header, then parse JSON.

## Debugging Authentication Failures

| Symptom in Make | Likely cause |
|-----------------|--------------|
| `401` on every run | Key in the keychain differs from `MAKE_WEBHOOK_SECRET` (watch for a missing `Bearer ` prefix or trailing whitespace) |
| `401` only with a custom header | **API key parameter name** differs from `MAKE_WEBHOOK_HEADER` |
| `401` with query placement | Key is in the query string, not a header |
| `400 Invalid JSON body` | **Body content type** isn't JSON, or the JSON string expression produced invalid JSON |
| Module error about the URL | Make requires `https://`; use a public URL or `npx hookdeck-cli listen` |

Check the module's output bundle for the exact status and response body.
