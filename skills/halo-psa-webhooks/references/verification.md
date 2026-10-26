# How to Authenticate HaloPSA Webhooks

## Does HaloPSA Sign Webhooks?

No. There is no signature header, no HMAC and no timestamp. The only authentication Halo offers
is **Basic Authentication**: `Authorization: Basic base64(username:password)`, using the username
and password you entered on the webhook. Choose Basic Authentication on the Halo webhook.

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Use HTTPS, and rotate the credential if it leaks.

## How It Works

1. Read the `Authorization` header. The scheme `Basic` is case-insensitive.
2. Accept only the strict base64 alphabet (`A-Z a-z 0-9 + /`, padding `=` only at the end, length
   a multiple of 4) and decode strictly (`validate=True` in Python), so valid credentials
   followed by junk are rejected. The decoded bytes must be valid UTF-8.
3. Split the decoded text on the **first** colon: the username can't contain one, the password can.
4. Compare the username and the password **each** in constant time, and evaluate both before
   deciding (no short-circuit).
5. Missing or malformed header, or a mismatch: `401`.

The credentials must arrive on the first request. Hookdeck never sends a `401` +
`WWW-Authenticate` challenge and verifies the request as received.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

const digest = (v) => crypto.createHash('sha256').update(v).digest();
// Hashing both sides gives equal-length buffers, so timingSafeEqual never throws.
const safeEqual = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function parseBasicAuth(header) {
  const match = /^basic +(\S+)$/i.exec(typeof header === 'string' ? header : '');
  if (!match || match[1].length % 4 !== 0 || !BASE64_RE.test(match[1])) return null;
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(match[1], 'base64'));
  } catch {
    return null;
  }
  const sep = decoded.indexOf(':');
  return sep === -1 ? null : { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

function verifyHaloPsaRequest(headers, env = process.env) {
  if (!env.HALO_PSA_WEBHOOK_USERNAME || !env.HALO_PSA_WEBHOOK_PASSWORD) return false;
  const creds = parseBasicAuth(headers['authorization']);
  if (!creds) return false;
  const userOk = safeEqual(creds.username, env.HALO_PSA_WEBHOOK_USERNAME);
  const passOk = safeEqual(creds.password, env.HALO_PSA_WEBHOOK_PASSWORD);
  return userOk && passOk;
}
```

Alternatively compare lengths first and then `crypto.timingSafeEqual` on equal-length Buffers.

### Python

```python
import base64, binascii, hmac, re

BASE64_RE = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")

def safe_equal(a: str, b: str) -> bool:
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def parse_basic_auth(header):
    match = re.match(r"^basic +(\S+)$", header or "", re.IGNORECASE)
    if not match or len(match.group(1)) % 4 or not BASE64_RE.match(match.group(1)):
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    return tuple(decoded.split(":", 1)) if ":" in decoded else None
```

See the complete, tested handlers in [../examples/](../examples/).

## Common Gotchas

- **Raw body.** Read the body raw (`express.raw({ type: '*/*' })`) so any content type works,
  and authenticate before parsing it.
- **Batching.** With batching on the body is a JSON array. Accept both an object and an array.
- **Not preemptive?** The docs don't say whether credentials are sent preemptively. A server that
  waits for a `401` challenge won't work: Hookdeck never challenges.
- **Passwords with colons** work, because only the first colon splits the pair.
- **Don't short-circuit.** Evaluate the username and password comparisons both, then combine.
- **Fail closed.** If either environment variable is unset, reject every request.
- **GET method.** Halo's Method setting also offers GET (for retrieving data); notifications are
  POSTs and Hookdeck's source accepts POST only.

## How Do I Debug 401s from a Halo Webhook?

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Authentication left on *No Authentication* in Halo (no header sent) |
| `401` after editing the webhook | Username or password changed in Halo but not in your env |
| `401` with a correct-looking pair | Trailing whitespace or newline in the env value, or a different username |
| `401` only for some passwords | Non-ASCII password compared as `str` in Python (use bytes) |

Check the **Deliveries** tab of the webhook in Halo for the response your endpoint returned.
