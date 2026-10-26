# How to Verify Amplitude Webhook Requests

## Does Amplitude Sign Webhooks?

No. The Webhook destination sends no signature and no timestamp. The only authentication is a
secret header you add in the destination's header rows (up to five custom headers after the
preset `Content-Type` and `User-Agent: Amplitude/Webhook/1.0`).

```
X-Amplitude-Secret: Bearer your-secret      # name and value are yours
```

Because the name is user-chosen, read it from configuration:

- `AMPLITUDE_WEBHOOK_HEADER`: the header name (default `Authorization`), looked up case-insensitively
- `AMPLITUDE_WEBHOOK_SECRET`: the exact, whole header value, including any `Bearer ` prefix

Compare the **whole** value. Do not strip or parse a `Bearer ` prefix. Missing header or mismatch
returns `401`.

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the body, and gives **no replay
protection**: there is no signature and no timestamp, so anyone who captures a request can resend
it. Use HTTPS, make handlers idempotent, and rotate the credential if it leaks.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyAmplitudeRequest(
  headers,
  secret = process.env.AMPLITUDE_WEBHOOK_SECRET,
  headerName = process.env.AMPLITUDE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Hashing both sides gives equal-length buffers, so `timingSafeEqual` never throws. (Checking that
the lengths match before comparing equal-length `Buffer`s works too, at the cost of revealing the
secret's length.)

### Python

```python
import hmac

def verify_amplitude_request(headers, secret, header_name="Authorization"):
    if not secret:
        return False
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

Encode both sides to bytes. `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`.

## Common Gotchas

- **Raw body:** the body isn't part of the check, but read it raw (`express.raw({ type: '*/*' })`,
  `request.text()`, `await request.body()`) and authenticate before parsing, so any content type
  works.
- **Bearer prefix:** if you typed `Bearer abc` in Amplitude, the expected secret is the whole
  `Bearer abc`. Comparing only `abc` fails.
- **Header name:** it's whatever you chose. If your endpoint checks `Authorization` but you added
  `X-Amplitude-Secret`, every request gets `401`.
- **Unconfigured secret:** reject everything when `AMPLITUDE_WEBHOOK_SECRET` is empty rather than
  comparing against an empty string.
- **Templates:** a FreeMarker template changes the body but not the headers.
- **No IP allowlist:** Amplitude has no single IP address for forwarding.

## How Do I Debug 401 Responses?

1. Confirm the header name in Amplitude matches `AMPLITUDE_WEBHOOK_HEADER` (case doesn't matter).
2. Confirm the value matches `AMPLITUDE_WEBHOOK_SECRET` exactly: prefix, trailing spaces, quotes
   from a `.env` file.
3. Check the secret was set in the running process's environment.
4. If a proxy or gateway sits in front, check it forwards the custom header.
5. Look at a request in the Hookdeck CLI web UI to see the headers Amplitude actually sent.
