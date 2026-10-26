# SendX Signature Verification

## How Does SendX Sign Webhooks?

1. SendX takes the JSON body as-is.
2. It computes HMAC-SHA256 over those bytes, keyed with your team API key.
3. The result is hex-encoded into `X-SendX-Signature` (bare digest, no prefix).

Only the body is signed: no timestamp, delivery id or other header. There is no replay window to
check, and you should not invent one from unsigned headers or body fields.

## Implementation

See [Verification (core)](../SKILL.md) for the short form. The full CI-tested handlers are in
[examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/). SendX has no SDK for this: manual verification is the
documented method (its samples are Python and Node.js).

## Common Gotchas

- **Raw body**: sign the exact bytes received. Do not decode and re-encode, or `JSON.parse` /
  `JSON.stringify`, before verifying. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()`
  (Next.js) or `await request.body()` (FastAPI).
- **Key is the team API key**: used as UTF-8 bytes, as-is. Do not hex- or base64-decode it.
- **Whole header value**: compare it as one digest. No prefix or list parsing.
- **Validate before decoding**: require exactly 64 hex characters, then compare in constant time.
  Hex is case-insensitive. Node: check lengths, then `crypto.timingSafeEqual` on equal-length
  Buffers, and never call `Buffer.from(sig, 'hex')` on an unvalidated value. Python:
  `hmac.compare_digest` on bytes, not `str`.
- **Status codes**: missing, empty, malformed or mismatched signature is `401`. A signed body that is
  not a JSON object is `400`.
- **`X-SendX-Signature-Alg`** is always `hmac-sha256`. SendX's own Python sample rejects other values;
  the examples may log it but do not depend on it, and neither does Hookdeck.
- **Wrong key**: intermittent failures usually mean a personal or project key rather than the Team API Key.
- **Proxies**: make sure a reverse proxy does not strip the custom `X-SendX-*` headers.

## Debugging Verification Failures

1. Log the raw body length and the received header, and compare against a locally computed digest.
2. Confirm `SENDX_WEBHOOK_SECRET` is the Team API Key with no extra whitespace or quotes.
3. Confirm a body parser is not consuming the stream before your raw read.
4. Re-run the test in the example to confirm your signing code matches.
