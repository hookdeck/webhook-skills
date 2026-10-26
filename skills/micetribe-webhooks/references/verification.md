# How to Verify MICEtribe Webhook Signatures

## How It Works

When a webhook has a signing secret, every delivery carries:

| Header | Value |
|--------|-------|
| `X-Signature` | Lowercase hex HMAC-SHA256, bare digest (no `sha256=` prefix) |
| `X-Timestamp` | Unix timestamp in seconds used when signing |
| `X-Request-Id` | UUID for this delivery attempt |

MICEtribe's docs:

```
signature = HMAC-SHA256( secret, timestamp + "." + raw_request_body )
secret            — the signing secret you configured on the webhook
timestamp         — value of X-Timestamp (string)
raw_request_body  — exact JSON bytes in the POST body (no re-encoding)
```

"Compare the result (hex) to `X-Signature` using a constant-time comparison."

> MICEtribe signs webhooks only when the webhook has a signing secret. Set one on the webhook and paste it here.

## Implementation

MICEtribe has no webhook verification SDK, so verification is manual. Build the signed message as **bytes**:

1. the `X-Timestamp` header value exactly as received (encode latin1; never trim, parse or reformat it),
2. a literal `.`,
3. the raw body bytes as received.

Key the HMAC with the secret's UTF-8 bytes, as-is. Validate `X-Signature` as exactly 64 hex characters before decoding it, lowercase it (hex is case-insensitive), and compare the whole header value as one digest in constant time. Missing or empty headers, a malformed value or a mismatch gets a `401`.

### Node.js

```javascript
const crypto = require('crypto');

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

function verify(rawBody, signature, timestamp, secret) { // rawBody: Buffer
  if (!signature || !timestamp || !HEX_SHA256.test(signature)) return false;
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(signed).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Express: `express.raw({ type: '*/*' })`. Next.js: `Buffer.from(await request.arrayBuffer())`. See [examples/express](../examples/express/) and [examples/nextjs](../examples/nextjs/).

### Python

```python
import hmac, hashlib, re

def verify(raw_body: bytes, signature: str, timestamp: str, secret: str) -> bool:
    if not signature or not timestamp or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)
```

FastAPI: `await request.body()`. See [examples/fastapi](../examples/fastapi/).

## Timestamp Tolerance (opt-in)

`X-Timestamp` is Unix seconds. MICEtribe lists "reject old timestamps (optional), e.g. older than 5 minutes" as a recommendation. The examples **don't reject old timestamps by default**: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries (MICEtribe's own retries go out up to 12 hours later, too). To opt in, set `MICETRIBE_WEBHOOK_TOLERANCE_SECONDS` to a positive number (unset or `0` = off); a non-numeric `X-Timestamp` is then rejected. Dedupe on `registration_id` + `meta.trigger` + `X-Request-Id` for replay protection instead.

## Common Gotchas

- **Raw body only.** Don't `JSON.parse`/`JSON.stringify` (or decode and re-encode the body) before verifying; any whitespace or escape change breaks the digest.
- **The timestamp is part of the signed content.** A body-only HMAC will never match.
- **No prefix.** `X-Signature` is the bare hex digest; don't parse `sha256=` or split a list.
- **Unsigned webhooks.** Without a signing secret MICEtribe sends no `X-Signature`.
- **Secret encoding.** Use the secret as UTF-8 text, not hex- or base64-decoded.
- **Never call `Buffer.from(sig, 'hex')` on an unvalidated value**; it silently drops bad characters. Python: use `hmac.compare_digest` on bytes, not `str`.
- **Express 5:** `req.body` is a `Buffer` only under `express.raw()`; keep it off the global `express.json()`.

## Debugging Verification Failures

- `Missing X-Signature header`: the webhook has no signing secret, or a proxy stripped the header.
- `Malformed X-Signature header`: not exactly 64 hex characters (a prefix, quotes or whitespace were added).
- `Invalid signature`: check the secret matches the one set on the webhook, the body wasn't re-encoded by middleware, and `X-Timestamp` is passed through unchanged.
