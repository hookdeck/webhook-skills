# bundle.social Signature Verification

## How It Works

bundle.social signs every delivery with your webhook's Signing Secret:

| Item | Value |
|------|-------|
| Header | `x-signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body, exactly as sent |
| Encoding | Lowercase hex, no prefix |
| Timestamp | None (there's no timestamp header or replay window) |

```
x-signature = hex(HMAC-SHA256(key = signing_secret, message = raw_body))
```

## Official SDK (Node.js)

The [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) package ships a
helper:

```javascript
const { Bundlesocial } = require('bundlesocial');

// The client needs an API key to be constructed; verification doesn't use it.
const bundle = new Bundlesocial(process.env.BUNDLE_SOCIAL_API_KEY || '');

// rawBody: string. Throws Error('Invalid signature') on mismatch.
const event = bundle.webhooks.constructEvent(rawBody, signature, secret);
// event: { type, data }, typed as WebhookEvent in TypeScript
```

- `constructEvent(rawBody: string, signature: string, secret: string)` returns the
  parsed event, or throws. It's the only public verification entry point: the
  underlying `verifySignature` is declared `private` in the package's type
  definitions, so calling it from TypeScript won't compile. If you want a boolean
  rather than an exception, catch the throw or use the manual version below.
- Pass a **string**. If you pass an object, the SDK `JSON.stringify`s it, which
  rarely reproduces the original bytes, and verification fails.
- The SDK compares with `===`, not a constant-time comparison. If that matters to
  you, use the manual version below (it's what bundle.social's own Express example
  in the Direct Messages docs does).

## Manual Verification

### Node.js

```javascript
const crypto = require('crypto');

function verifyBundleSocialWebhook(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib
import hmac

def verify_bundle_social_signature(raw_body: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8"))
```

## Getting the Raw Body

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: 'application/json' })` on the webhook route, then `req.body` (a Buffer). Don't mount `express.json()` before it for this route |
| Next.js (App Router) | `await request.text()` |
| FastAPI | `await request.body()` |

## Common Gotchas

1. **Parsing before verifying.** Re-serialized JSON changes whitespace and key
   order, so the HMAC no longer matches. Verify the raw bytes, then parse.
2. **Wrong header.** The header is `x-signature` (lowercase in Node's
   `req.headers`). It is not a Standard Webhooks `webhook-signature` header and has
   no `sha256=` prefix.
3. **Base64 vs hex.** The digest is hex. Comparing against a base64 digest always
   fails.
4. **Wrong secret.** Use the webhook's Signing Secret, not your API key.
5. **Length mismatch with `timingSafeEqual`.** Node throws if the buffers differ in
   length; check lengths first (as above) so a malformed header returns `400`
   instead of crashing.
6. **No replay protection.** The signature has no timestamp, so a captured delivery
   stays valid. De-duplicate on `type` + `data.id` + `data.status` + a timestamp
   (`data.updatedAt`) to make replays harmless.

## Responding

- Missing or invalid signature: return `400` (bundle.social's own example uses
  `401`; any non-2xx counts as a failed delivery).
- Valid: return `2xx` within 15 seconds, including for event types you don't handle.

## Sources

The main [Webhooks](https://info.bundle.social/api-reference/webhooks) page names the
header and the algorithm but links to a "Security" section that isn't actually
published, so it never spells out the encoding or the signed content. The scheme
above is confirmed from three other places that agree:

- [DM Webhooks](https://info.bundle.social/api-reference/direct-messages/webhooks) —
  bundle.social's own Express example, the one doc page that writes the scheme out
  in full: `createHmac('sha256', secret).update(req.body).digest('hex')` compared
  against `x-signature` with `timingSafeEqual`.
- The official [`bundlesocial`](https://www.npmjs.com/package/bundlesocial) npm
  package (v2.70.0), whose verification helper is exactly that hex HMAC.
- Hookdeck's own `BUNDLE_SOCIAL` source verification: HMAC, `sha256`,
  header `x-signature`, encoding `hex`.
