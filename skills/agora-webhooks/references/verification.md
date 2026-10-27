# Agora Signature Verification

## How Does Agora Sign Webhooks?

Agora sends two signatures over the same input, the **raw request body**:

| Header | Algorithm |
|--------|-----------|
| `Agora-Signature` | HMAC-SHA1, lowercase hex (40 characters, no prefix) |
| `Agora-Signature-V2` | HMAC-SHA256 of the same input |

The key is the Signing Secret as UTF-8 bytes. No timestamp, id or other header is signed. These examples verify `Agora-Signature` only, matching Hookdeck's Agora source.

## Implementation

See the `verifyAgoraWebhook` / `verify_agora_webhook` functions in [examples/express/src/index.js](../examples/express/src/index.js), [examples/nextjs/app/webhooks/agora/route.ts](../examples/nextjs/app/webhooks/agora/route.ts) and [examples/fastapi/main.py](../examples/fastapi/main.py). Each:

1. Rejects a missing header or secret.
2. Checks the header is exactly 40 hex characters before decoding.
3. Computes HMAC-SHA1 over the raw bytes.
4. Compares with `crypto.timingSafeEqual` / `hmac.compare_digest` on bytes.

Failures return `401`.

## Common Gotchas

- **Raw body**: don't `JSON.parse`/`JSON.stringify` before verifying; whitespace changes break the digest. In Express use `express.raw({ type: '*/*' })`.
- **Hex case**: compare case-insensitively (lowercase both sides or decode to bytes).
- **No prefix**: the header is the bare digest; do not strip `sha1=`.
- **No replay window**: there is no signed timestamp. Dedupe on `noticeId` instead.
- **Secret as text**: do not hex- or base64-decode the Signing Secret.

## How to Debug Verification Failures

1. Log the raw body length and compare against what Agora sent (Hookdeck's request view shows the original bytes).
2. Confirm `AGORA_WEBHOOK_SECRET` is the Signing Secret of this webhook, with no surrounding whitespace.
3. Check a proxy or framework isn't re-encoding the body.
