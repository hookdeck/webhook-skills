# CallRail Signature Verification

## How Does CallRail Sign Webhooks?

Every request includes a `Signature` header. Its value is the base64 encoding of an HMAC-SHA1 digest of the raw request body, keyed with your company's signing key. Nothing else is signed: no timestamp, no event id, no prefix.

```ruby
# From the CallRail docs
hmac = OpenSSL::HMAC.digest(OpenSSL::Digest.new('sha1'), YOUR_COMPANY_SIGNING_KEY, request_payload)
signature = Base64.strict_encode64(hmac)
```

The signing key is a random 32-character hex string, but it is used as a plain string. Do not hex-decode it.

## Implementation

CallRail has no webhook verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCallRailSignature(rawBody, signature, signingKey) {
  if (!signature || !signingKey) return false;
  const expected = crypto.createHmac('sha1', signingKey).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Python

```python
import base64, hashlib, hmac

def verify_callrail_signature(raw_body: bytes, signature: str, signing_key: str) -> bool:
    digest = hmac.new(signing_key.encode(), raw_body, hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode()
    return hmac.compare_digest(signature.encode(), expected.encode())
```

## How Do I Test My Implementation?

The CallRail docs publish a test vector. With the key `072e77e426f92738a72fe23c4d1953b4` and the docs' JSON body, the result must be `UZAHbUdfm3GqL7qzilGozGzWV64=`. The body must be the compact JSON exactly as it appears in the docs, with no trailing newline: adding a newline or re-serializing the JSON gives a different signature. The example tests in `examples/` include this vector.

## How Do I Prevent Replay Attacks?

The signed content has no timestamp, but every body has one (`timestamp`, or `submitted_at` for form submissions) that you can compare to the current time. The examples enable this only when `CALLRAIL_TIMESTAMP_TOLERANCE_SECONDS` is set above 0.

Be careful with the window: a call's `timestamp` is the call start time, and post-call webhooks fire after the call ends and the recording attaches (up to 20 minutes later). A 5 minute window rejects valid post-call webhooks. Use at least an hour, or skip the check and de-duplicate on `id`.

## Common Gotchas

- **Raw body**: verify the exact bytes received. Parsing and re-stringifying the JSON changes the signature.
- **Header name**: the header is `Signature` (not `X-Signature`). HTTP header names are case-insensitive, and frameworks usually lowercase them.
- **Key choice**: the key belongs to the company, so use the key of the company that owns the webhook integration.
- **Query string**: legacy fields also appear in the query string. They are not signed, so ignore them (your own `callrail_event` hint is also unsigned; it only selects a handler).
- **No retries**: a `4xx` for a bad signature is correct, but a `5xx` or timeout on a good request loses the event, because CallRail does not resend.

## Debugging Verification Failures

1. Log the length of the raw body and confirm it is a Buffer/bytes, not a parsed object.
2. Compute the signature of the docs test vector with your code. If that passes, the problem is the key or the body handling.
3. Confirm the key is the signing key from the Webhooks page, not your API token.
4. Check that no middleware (JSON parser, proxy) rewrites the body.
5. Make sure there is no trailing whitespace on the signing key in your `.env`.
