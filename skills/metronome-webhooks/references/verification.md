# How to Verify Metronome Webhook Signatures

## How It Works

Metronome sends two headers you need:

| Header | Value |
|--------|-------|
| `Metronome-Webhook-Signature` | Lowercase hex HMAC-SHA256 digest (64 characters, no prefix) |
| `X-Metronome-Date` | HTTP date, e.g. `Mon, 02 Jan 2006 22:04:05 GMT` |

Signed message (bytes):

```
{X-Metronome-Date header value} + "\n" + {raw request body}
```

- Key: the webhook's secret key, its UTF-8 bytes used as-is (not hex- or base64-decoded)
- Algorithm: HMAC-SHA256, compared as hex against the whole header value
- The separator is one real newline byte (LF, `0x0A`), not the two characters backslash and `n`
- Metronome also sends a standard `Date` header with the same value. Use `X-Metronome-Date`: intermediaries may rewrite `Date`

This is the scheme Hookdeck's Metronome source verifies (HMAC, SHA-256, hex, signed content `{header:x-metronome-date}\n{body}`).

## Implementation

There is no SDK helper; verify manually. Build the message as bytes: the header encoded latin1, the separator, then the body bytes exactly as received. Never decode the body to a string and re-encode it, and never `JSON.parse`/`JSON.stringify` before verifying.

### Node.js

```javascript
const crypto = require('crypto');

function verifyMetronomeSignature(rawBody, signature, dateHeader, secret) {
  if (!signature || !dateHeader || !secret) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const signed = Buffer.concat([Buffer.from(dateHeader, 'latin1'), Buffer.from('\n'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const provided = Buffer.from(signature.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

### Python

```python
import hashlib, hmac, re

def verify_metronome_signature(raw_body: bytes, signature, date_header, secret) -> bool:
    if not signature or not date_header or not secret:
        return False
    provided = signature.encode("latin-1")
    if not re.fullmatch(rb"[0-9a-fA-F]{64}", provided):
        return False
    signed = b"".join([date_header.encode("latin-1"), b"\n", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest().encode()
    return hmac.compare_digest(provided.lower(), expected)
```

Express needs `express.raw({ type: '*/*' })` so the bytes are intact for any content type; Next.js uses `await request.arrayBuffer()`; FastAPI uses `await request.body()`.

## Published Test Vector

Metronome's docs give a worked example, and every example's tests assert it:

- Secret: `correct-horse-battery-staple`
- `X-Metronome-Date`: `Mon, 02 Jan 2006 22:04:05 GMT`
- Body (pretty-printed exactly as shown, no trailing newline):

```
{
  "id": "b2c9e307-624e-4e7d-a5a4-1b74107d78c4",
  "type": "widget_created",
  "properties": {
    "customer_id": "5f794d50-085a-4db6-8d15-286e518b7225",
    "widget_id": "0891458d-b6f0-4fdd-a41e-380aae1a1e38"
  }
}
```

- Signature: `b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b`

If your verifier doesn't reproduce this digest from those inputs, the signed bytes are wrong.

## Common Gotchas

- **Raw body.** Re-serialised JSON changes whitespace and key order, so the digest won't match. The vector's body has newlines and two-space indentation.
- **Literal `\n`.** In some languages a backslash-n typed into a template or config is two characters. Use a real LF byte.
- **`Date` vs `X-Metronome-Date`.** Sign over `X-Metronome-Date` only.
- **Header trimming.** Use the header value exactly as received.
- **Decoding the secret.** Don't base64- or hex-decode it.
- **Case.** Hex is compared case-insensitively; lowercase both sides (or decode both) before the constant-time compare.
- **Whole value.** The header is one digest: no prefix, no comma-separated list.
- **Wrong secret.** Each webhook has its own secret key; use the one for the endpoint that received the request.

## Timestamp Tolerance (Opt-in)

Metronome's docs suggest ignoring requests older than five minutes. The examples do **not** do this by default: Hookdeck retries and replays resend the original `X-Metronome-Date`, and Hookdeck applies no tolerance itself, so a fixed window rejects legitimate retries. Deduplicate on the body's `id` instead. To opt in, set `METRONOME_WEBHOOK_TOLERANCE_SECONDS` (for example `300`); unset or `0` leaves it off. Rejected requests get `401`.

## Debugging Verification Failures

1. Log the lengths of the signature (64 expected), the body in bytes, and the `X-Metronome-Date` value as received.
2. Re-run the test vector above against your function.
3. Check the framework isn't parsing or decompressing the body first, and that no proxy changes the body or `X-Metronome-Date`.
4. Confirm `METRONOME_WEBHOOK_SECRET` is the secret key for this webhook, with no stray whitespace or quotes.
