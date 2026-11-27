# How to Verify NMI Webhook Signatures

## Why Signature Verification Matters

Anyone who learns your endpoint URL can POST fake events to it. The
`Webhook-Signature` header proves the delivery came from NMI and was not
tampered with, because only you and NMI know the signing key. Never act on a
webhook whose signature you have not verified.

## How It Works

NMI does **not** use the Standard Webhooks spec. Each delivery carries one
header:

```
Webhook-Signature: t=<nonce>,s=<signature>
```

- **`t`** — what NMI's sample calls the **nonce**. The docs don't say what it
  holds or whether it is a timestamp, and document no age/replay window.
- **`s`** — the signature: **lowercase hex** HMAC-SHA256.

The signed content is the nonce, a literal `.`, and the **raw request body**:

```
s = HMAC-SHA256( key = signing key, message = <nonce> + "." + <raw_body> )
  → hex encode (lowercase)
```

So to verify: extract `t` and `s`, recompute the HMAC over `t + "." + rawBody`,
and compare your hex digest to `s` with a timing-safe comparison.

### Why you must use the raw body (not re-serialized JSON)

HMAC is byte-exact. If you `JSON.parse` the body and then `JSON.stringify` it,
the result can differ from what NMI signed — key order, whitespace, number
formatting, and Unicode escaping are not guaranteed to round-trip. That produces
a different hash and verification fails. Capture the **raw bytes** and hash those.

### Parsing the header safely

The header is `t=<nonce>,s=<signature>`. Split on `,`, then split each segment
at the **first** `=` (not every `=`), so a value containing `=` is preserved.
Build a small `{ t, s }` map rather than relying on positional order.

## Implementation

There is **no official NMI SDK**, so verification is manual in every language.
The algorithm is identical everywhere.

### Node.js / TypeScript

```javascript
const crypto = require('crypto');

function verifyNmiWebhook(rawBody, signatureHeader, signingKey) {
  // Parse "t=<nonce>,s=<hex>" into { t, s } (split each segment at the first '=')
  const parts = {};
  for (const seg of String(signatureHeader || '').split(',')) {
    const i = seg.indexOf('=');
    if (i !== -1) parts[seg.slice(0, i).trim()] = seg.slice(i + 1).trim();
  }
  const { t: nonce, s: signature } = parts;
  if (!nonce || !signature || !signingKey) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(`${nonce}.${body}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false; // length mismatch = invalid
  }
}
```

### Python

```python
import hmac
import hashlib


def verify_nmi_webhook(raw_body: bytes, signature_header: str, signing_key: str) -> bool:
    # Parse "t=<nonce>,s=<hex>" into a dict (split each segment at the first '=')
    parts = {}
    for seg in (signature_header or "").split(","):
        key, sep, value = seg.partition("=")
        if sep:
            parts[key.strip()] = value.strip()

    nonce = parts.get("t")
    signature = parts.get("s")
    if not nonce or not signature or not signing_key:
        return False

    signed = nonce.encode("utf-8") + b"." + raw_body
    expected = hmac.new(
        signing_key.encode("utf-8"),
        signed,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
```

## Common Gotchas

- **`t` is what NMI calls a nonce.** Do not parse it as a Unix time and do not
  reject "old" deliveries — NMI documents no timestamp/replay window.
- **Use the raw body.** If your framework parses JSON before you verify, the raw
  bytes are gone. Use `express.raw()`, `await request.text()`, or
  `await request.body()` (bytes) — see the examples.
- **Sign `<nonce>.<rawBody>`.** The delimiter is a literal `.` between the nonce
  and the body. Forgetting it (or hashing only the body) is the most common
  cause of a mismatch.
- **Lowercase hex.** NMI sends `s` as lowercase hex. `digest('hex')` /
  `.hexdigest()` already produce lowercase; do not uppercase.
- **The signing key is the webhooks signing key, not an API key.** It's shown
  on Settings → Webhooks; API keys live under Settings → Security Keys.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`,
  never `==`. Wrap the Node comparison in try/catch — mismatched buffer lengths
  throw.
- **Parse the header at the first `=` per segment.** Splitting on every `=`
  mangles the value; rely on a `{ t, s }` map, not positional order.

## How to Debug Verification Failures

1. **Log the raw body and the parsed `t` / `s`.** Confirm you extracted the
   nonce and signature correctly and that the body is the raw bytes.
2. **Print your computed hex next to `s`.** If they differ, you are almost
   certainly hashing the wrong content — check the `<nonce>.<body>` construction
   and that you used the raw (not re-serialized) body.
3. **Confirm the signing key.** Ensure `NMI_SIGNING_KEY` is the webhooks signing
   key (Settings → Webhooks) with no stray whitespace/newline.
4. **Confirm raw-body access.** Temporarily log `typeof body` — if it's already
   an object, a JSON parser ran before verification.
