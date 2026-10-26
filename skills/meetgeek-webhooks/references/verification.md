# How to Verify MeetGeek Webhook Signatures

## How It Works

MeetGeek adds `X-MG-Signature: <hex_hmac_of_body>`. It computes HMAC-SHA256 of the exact raw request body, keyed with the configured secret, and hex-encodes it (lowercase, 64 characters, no prefix). Nothing else is signed: no timestamp, id or header. There is therefore no replay window; use `meeting_id` for idempotency.

MeetGeek's reference: `hmac.new(key=secret.encode(), msg=body, digestmod=hashlib.sha256).hexdigest()`.

## Implementation

No official SDK is documented, so verify manually. See [SKILL.md](../SKILL.md) for the Node and Python core, and the runnable examples:

- [examples/express/](../examples/express/)
- [examples/nextjs/](../examples/nextjs/)
- [examples/fastapi/](../examples/fastapi/)

Steps:

1. Read the raw body bytes (Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`).
2. Require `X-MG-Signature` and check it is exactly 64 hex characters.
3. Compute the HMAC-SHA256 over the bytes with the secret's UTF-8 bytes; hex-encode.
4. Lowercase the received value and compare in constant time (equal-length buffers / `hmac.compare_digest` on bytes).
5. Return `401` for a missing, malformed or mismatched signature. Parse JSON only after this.

## Common Gotchas

- **Parsing before verifying**: `JSON.parse`/`stringify` or decode/re-encode changes bytes and breaks the digest.
- **Content type**: use `*/*` with `express.raw` so the body is a Buffer whatever the content type.
- **Secret encoding**: the key is the secret string's UTF-8 bytes, not hex- or base64-decoded.
- **Unvalidated hex**: `Buffer.from(sig, 'hex')` silently drops bad characters; validate length and alphabet first.
- **Unsigned deliveries**: a request without `X-MG-Signature` must be rejected; Hookdeck fails verification for it too.
- **Duplicates**: retries and team-shared meetings can deliver the same `meeting_id` more than once.

## Debugging Verification Failures

- Compute the digest yourself: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$MEETGEEK_WEBHOOK_SECRET"` and compare to the header.
- Check a proxy or middleware is not re-serializing the body.
- Confirm you are using the secret configured for the Public API, with no stray whitespace.
