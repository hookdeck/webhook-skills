# How to Verify Cloudinary Webhook Signatures

## How It Works

Cloudinary delivers each notification with two headers:

- `x-cld-signature` — a **hex-encoded digest** of the signed material.
- `x-cld-timestamp` — the **unix timestamp in seconds** that is part of the signed
  material.

The signed material is the **raw request body**, the timestamp, and your account
API Secret, concatenated in that order:

```
signature = hexdigest( ALGORITHM( raw_body + timestamp + api_secret ) )
```

`ALGORITHM` is **sha1** (Cloudinary's default) or **sha256** (an opt-in account
setting).

> **It is a plain digest, not a keyed HMAC.** Cloudinary's documentation sometimes
> refers to this as "HMAC-SHA1", but the official SDK computes a plain
> `hash(raw_body + timestamp + api_secret)` — the secret is appended to the hashed
> material rather than used as an HMAC key. Because you should verify with the
> official SDK, this detail is abstracted away; it matters only if you implement
> verification manually (see below).

The signing secret is your **account API Secret** — the `api_secret` in
`CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>`. There is no
separate per-webhook signing secret.

> **The body also contains a `timestamp` and a `signature` field.** Ignore them
> for authentication — verify the **`x-cld-signature` / `x-cld-timestamp`
> headers** against the raw body.

## Implementation

### SDK Verification (recommended)

The official SDKs verify the digest **and** enforce a freshness window
(`valid_for`, default **7200 seconds** / 2 hours) on the timestamp, which guards
against replay. Keeping the default 7200s window in your synchronous handler is
fine and recommended.

**Node.js (`cloudinary`)**

```javascript
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  api_secret: process.env.CLOUDINARY_API_SECRET,
  signature_algorithm: process.env.CLOUDINARY_SIGNATURE_ALGORITHM || 'sha1', // 'sha256' if enabled
});

// rawBody MUST be the exact bytes received — do not JSON.parse then re-stringify
const valid = cloudinary.utils.verifyNotificationSignature(
  rawBody,
  Number(req.get('x-cld-timestamp')),
  req.get('x-cld-signature')
  // , valid_for defaults to 7200
);
```

`verifyNotificationSignature(body, timestamp, signature, valid_for = 7200)`
returns a boolean and reads the algorithm from `cloudinary.config()`.

**Python (`cloudinary`)**

```python
import cloudinary
from cloudinary.utils import verify_notification_signature

cloudinary.config(
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    signature_algorithm=os.getenv("CLOUDINARY_SIGNATURE_ALGORITHM", "sha1"),
)

valid = verify_notification_signature(
    raw_body,                        # str: the exact request body
    int(request.headers["x-cld-timestamp"]),
    request.headers["x-cld-signature"],
    # valid_for=7200 by default
)
```

`verify_notification_signature(body, timestamp, signature, valid_for=7200, algorithm=None)`
returns a boolean; when `algorithm` is `None` it uses `cloudinary.config().signature_algorithm`.

### Manual Verification (fallback)

If you cannot use the SDK, compute the digest yourself. Because sha1 is the
default and sha256 is an opt-in account setting, you can compute both and accept
either — each still requires the secret, so accepting both does not weaken
authentication:

```javascript
const crypto = require('crypto');

function verifyCloudinaryManually(rawBody, timestamp, signature, apiSecret) {
  if (!rawBody || !timestamp || !signature) return false;

  // Optional but recommended: reject stale timestamps (2h window, like the SDK).
  const now = Math.floor(Date.now() / 1000);
  if (Number(timestamp) < now - 7200) return false;

  const material = `${rawBody}${timestamp}${apiSecret}`;
  for (const algorithm of ['sha1', 'sha256']) {
    const expected = crypto.createHash(algorithm).update(material).digest('hex');
    try {
      if (
        expected.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
      ) {
        return true;
      }
    } catch {
      // length mismatch — try the next algorithm
    }
  }
  return false;
}
```

```python
import hashlib
import hmac
import time

def verify_cloudinary_manually(raw_body: str, timestamp: str, signature: str, api_secret: str) -> bool:
    if not raw_body or not timestamp or not signature:
        return False
    if int(timestamp) < int(time.time()) - 7200:
        return False
    material = f"{raw_body}{timestamp}{api_secret}".encode("utf-8")
    for algorithm in ("sha1", "sha256"):
        expected = hashlib.new(algorithm, material).hexdigest()
        if hmac.compare_digest(expected, signature):  # timing-safe compare
            return True
    return False
```

`sha1` is the default; only accept `sha256` if your account has it enabled (or
keep both as above for robustness).

## Common Gotchas

- **Use the raw body byte-for-byte.** The signature covers the exact bytes
  received. `JSON.parse` then `JSON.stringify` will re-order/re-format keys and
  break verification. Read the raw body first (`express.raw()`,
  `await request.text()`, `await request.body()`), verify, then parse.
- **Authenticate with the headers, not the body fields.** The body also carries a
  `timestamp` and `signature`; verification uses `x-cld-signature` and
  `x-cld-timestamp`.
- **Signature is hex, timestamp is unix seconds.** Pass the timestamp as a number
  (`Number(...)` / `int(...)`).
- **Match the algorithm.** sha1 by default; set sha256 only if your account
  enables it. A sha256-signed notification will not verify against a sha1 digest.
- **Freshness window.** The SDK rejects timestamps older than `valid_for` (default
  7200s). For a normal synchronous handler, keep the default.
- **The signing secret is the account API Secret** — not a per-webhook secret.

## Debugging Verification Failures

- **401 on every request:** confirm `CLOUDINARY_API_SECRET` matches the account
  API Secret exactly (watch for trailing whitespace), and that you are verifying
  the **raw** body — not a parsed-then-re-serialized copy.
- **Works for some notifications, fails for others:** a body parser is mutating
  the payload before verification. Ensure the raw body reaches the verifier.
- **Everything fails after enabling sha256:** set
  `CLOUDINARY_SIGNATURE_ALGORITHM=sha256` (or `cloudinary.config({ signature_algorithm: 'sha256' })`).
- **Intermittent failures on delayed processing:** the 7200s freshness window can
  reject very old timestamps. Verify promptly on receipt.

## Full Documentation

- [Notification signatures](https://cloudinary.com/documentation/notification_signatures)
- [Cloudinary notifications](https://cloudinary.com/documentation/notifications)
- [cloudinary_npm SDK](https://github.com/cloudinary/cloudinary_npm)
