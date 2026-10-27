# How to Verify Storylane Webhook Signatures

## How Does Storylane Sign Webhooks?

Every request carries `x-storylane-signature`, the **standard base64 (padded) HMAC-SHA256 of the raw
request body**, keyed with your Webhook Verification Secret. Storylane's own Node sample is
`crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64')`.

- Header value: the bare digest, no prefix (not `sha256=`), 44 characters ending in `=`
- Signed content: the raw body bytes only. No timestamp, id or other header is signed
- Key: the secret's UTF-8 bytes, used as-is
- Not Standard Webhooks

## Implementation

See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and
[examples/fastapi/](../examples/fastapi/). The steps are:

1. Read the raw body bytes (never `JSON.parse`/`JSON.stringify` first).
2. Require a non-empty header matching `^[A-Za-z0-9+/]{43}=$`.
3. Compute `base64(HMAC-SHA256(secret, rawBody))`.
4. Compare the two 44-character strings in constant time (`crypto.timingSafeEqual` on equal-length
   Buffers; `hmac.compare_digest` on bytes).
5. Respond `401` on any failure; parse the JSON only after the check passes.

## Common Gotchas

- **Raw body**: re-serialised JSON changes whitespace and key order. Use `express.raw({ type: '*/*' })`, `request.arrayBuffer()` or `await request.body()`.
- **Don't decode the signature**: `Buffer.from(sig, 'base64')` silently drops bad characters, and a final character with stray low bits decodes to the same bytes but Hookdeck rejects it. Validate the shape, then compare the strings.
- **`compare_digest` with `str`** raises `TypeError` on non-ASCII input; encode both sides to bytes.
- **No replay window**: nothing signed carries a time, so don't invent a tolerance from unsigned fields.
- **Which secret**: Storylane's docs don't say whether the secret is per alert or per account. If verification fails for one alert but not another, check you're using that alert's secret.

## How to Debug Verification Failures

1. Log the raw body length and the header value; the header must be 44 characters ending in `=`.
2. Confirm the secret has no stray whitespace or quotes.
3. Confirm no middleware parsed the body before verification.
4. Recompute the digest locally with the Node snippet from Storylane's docs and compare.
