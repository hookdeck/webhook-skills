# How to Verify Column Webhook Signatures

## How Does Column Sign Webhooks?

Every request has this header:

```
Column-Signature: <64 lowercase hex characters>
```

- Algorithm: HMAC-SHA256
- Key: the endpoint's signing secret, used as-is (UTF-8 bytes)
- Signed message: the **raw request body bytes**, nothing else
- Header value: the bare hex digest. No prefix, no `t=`/`v1=` parts, no list

Column's docs say to use the raw payload without any modification: prettifying, deserialising and re-serialising, or trimming whitespace can change the signature.

The docs never state the output encoding. Hookdeck's Column source uses hex, confirmed by two production integrations (hackclub/hcb, formancehq/payments). The docs also show no header value and no test vector.

## How Do I Compare Safely?

- Compare the **whole header** as one digest. Don't split it or look for a prefix.
- Validate the format first: exactly 64 hex characters. Hex is case-insensitive, so lowercase it (or decode both sides to bytes) before comparing.
- **Node:** after the pattern check, `Buffer.from(signature, 'hex')` is safe; compare equal-length buffers with `crypto.timingSafeEqual`. Never call `Buffer.from(sig, 'hex')` on an unvalidated value, it silently drops invalid characters.
- **Python:** `hmac.compare_digest` on bytes (`.encode()` both sides). Passing `str` raises `TypeError` for non-ASCII input, which would be a 500 instead of a rejection.

## Is There a Replay Window?

No. Column signs only the body, so there is no timestamp to check and no tolerance to configure. Don't build a window from unsigned headers or body fields (such as a `created_at` in the payload). Deduplicate on the event `id` instead.

## Common Gotchas

- **Raw body:** read the bytes before parsing (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). A body-parsing middleware such as `express.json()` ahead of your route breaks the signature.
- **Per-endpoint secret:** each endpoint has its own secret. Using another endpoint's secret fails every delivery.
- **Encoding:** the header is hex. A base64 or `sha256=`-prefixed value is rejected.
- **Status codes:** the examples reply `401` for a missing, malformed or mismatched signature.
- **Respond quickly:** Column expects a `2xx` within 10 seconds. Acknowledge, then process asynchronously.

## How Do I Debug Verification Failures?

- Compare `COLUMN_WEBHOOK_SECRET` with the endpoint's secret in Webhook settings (no whitespace or quotes), and check you're using the secret of the endpoint that received the request (`Webhook-Endpoint-Id`).
- Log the byte length of the body you hash and compare it with the request's `Content-Length`; a mismatch means something modified the body.
- Behind a proxy that rewrites the body? Compute the HMAC over what Column sent.
- Compute the expected digest yourself with `openssl dgst -sha256 -hmac "$SECRET" body.json` and compare it to the header.
