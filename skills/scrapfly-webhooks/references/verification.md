# Scrapfly Signature Verification

## How It Works

Scrapfly signs every webhook with **HMAC-SHA256** over the **raw request body bytes**. The digest is emitted as **uppercase hexadecimal** in the `X-Scrapfly-Webhook-Signature` header. A duplicate lowercase variant is sent as `X-Scrapfly-Webhook-Signature-Lowercase` for runtimes that normalise headers.

There is **no timestamp** in the scheme and **no replay window** — treat the signature as authenticity-only. (If you need replay protection, gate processing on the `X-Scrapfly-Webhook-Id` header or the job UUID.)

## Algorithm

```
signature = upper(hex(HMAC_SHA256(secret_utf8, raw_body_bytes)))
```

Compare with `received == signature` using a constant-time comparison.

## Implementation

Scrapfly does not publish an SDK for webhook verification — implementations follow the documented algorithm manually.

### Node.js / Express / Next.js

```javascript
const crypto = require('crypto');

function verifyScrapflySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
    .toUpperCase();

  const received = signatureHeader.toUpperCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}
```

Notes:
- `rawBody` must be a `Buffer` (Express) or the raw `string` from `await request.text()` (Next.js). **Never** `JSON.parse` and re-stringify — that mutates whitespace/key order and breaks the signature.
- `crypto.timingSafeEqual` requires equal-length buffers; the `try/catch` swallows length mismatches so the function returns `false` rather than throwing.

### Python / FastAPI

```python
import hmac
import hashlib

def verify_scrapfly_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256,
    ).hexdigest().upper()

    return hmac.compare_digest(expected, signature_header.upper())
```

Notes:
- Use `await request.body()` in FastAPI to get `bytes`. Do not call `await request.json()` before verifying.
- `hmac.compare_digest` is the documented constant-time comparator.

## Security: Do Not Log the Raw Payload

Scrapfly echoes the webhook signing secret in the body at `context.webhook.secret`. This is unusual compared to other providers and easy to miss.

- **Never** log the raw payload, dump it to stdout in production, or forward it to third-party tools (Sentry, Datadog, Slack, etc.) without redacting `context.webhook.secret` first.
- If you persist webhooks for replay/debugging, strip or redact `context.webhook.secret` before storage.
- Anyone with the secret can forge valid signatures for your endpoint.

```javascript
// Redact before logging / forwarding
const safe = { ...payload, context: { ...payload.context, webhook: { ...payload.context?.webhook, secret: '[REDACTED]' } } };
```

## Common Gotchas

- **Parsed JSON breaks signatures.** Verify against the exact bytes Scrapfly sent. In Express, mount `express.raw({ type: '*/*' })` on the webhook route (not `express.json`). In Next.js App Router, read with `await request.arrayBuffer()` and wrap with `Buffer.from(...)` — do **not** use `await request.text()`, which UTF-8-decodes the bytes (corrupts binary screenshot bodies). In FastAPI, use `await request.body()`.
- **Screenshot deliveries are binary regardless of the Content-Type you configured.** Scrapfly's webhook config has a Content-Type dropdown (`application/json` or `application/msgpack`); whichever you pick is sent on every delivery as the `Content-Type` header. For Scrape and Extraction API deliveries the body shape matches what you configured (JSON or msgpack). For Screenshot API deliveries the body is raw image bytes (JPEG / PNG / WebP / GIF) no matter what's in the header — an upstream Scrapfly quirk: the configured Content-Type is sent verbatim, but the screenshot delivery is the binary image and never actually a serialised object. **Dispatch on `X-Scrapfly-Webhook-Resource-Type`, not on `Content-Type`, and only parse the body after dispatching.** Verification works fine over any body — only the parse step needs to know what to expect. The example handlers in this skill follow that pattern: signature check → resource-type dispatch → JSON parse only for scrape / extraction / crawler.
- **JSON vs msgpack parsing.** The example handlers in this skill assume the Scrapfly dashboard is configured to send `application/json`. If you configured `application/msgpack` instead, swap the parse step in the scrape / extraction / crawler branches for a msgpack decoder (e.g. [`@msgpack/msgpack`](https://www.npmjs.com/package/@msgpack/msgpack) on Node, [`msgpack`](https://pypi.org/project/msgpack/) on Python). The signature check, the binary screenshot path, and the rest of the handler don't change.
- **Case of the hex digest.** Scrapfly's primary header is uppercase, but the `-Lowercase` variant exists for a reason. Always normalise both sides before comparing (the snippets above use `.toUpperCase()` / `.upper()`).
- **Header casing in HTTP frameworks.** HTTP header names are case-insensitive. Express lowercases everything; Next.js's `headers.get(...)` is also case-insensitive. Read `x-scrapfly-webhook-signature`.
- **No timestamp tolerance.** Don't reject for old timestamps — there isn't one. If you need replay protection, dedupe on `X-Scrapfly-Webhook-Id`.
- **Secret format.** Use the dashboard string verbatim. There is no `whsec_` prefix to strip and no base64 decode step.
- **Body encoding.** The HMAC is over bytes, not text. Avoid any middleware that transforms encoding (gzip middleware, BOM strippers, etc.) on the route.

## Alternative: Verify at the Gateway with Hookdeck

If your handlers sit behind Hookdeck Event Gateway, you can offload Scrapfly signature verification to the gateway and have your handler verify only Hookdeck's signature downstream. Hookdeck has a built-in `SCRAPFLY` source type that knows the exact algorithm (uppercase hex HMAC-SHA256, dual-case headers, raw-body) and will reject invalid deliveries at the edge.

Set up by creating a Hookdeck source with `--type SCRAPFLY` and the same signing secret you configured in Scrapfly, then have your handler verify `x-hookdeck-signature` instead of `X-Scrapfly-Webhook-Signature`. See the [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) and [hookdeck-event-gateway-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway-webhooks) skills for the downstream verification pattern.

A known caveat (May 2026): if your Scrapfly dashboard is configured to send `application/json` (the default), Hookdeck rejects Scrapfly screenshot deliveries with `UNPARSABLE_JSON` because the configured Content-Type doesn't match the binary screenshot body. This is upstream Scrapfly behaviour: the Content-Type dropdown applies to every delivery, but screenshot bodies are binary regardless. Pending resolution, route screenshot deliveries directly to your handler without the gateway preset, or configure the webhook to send `application/msgpack` if you can use a parser that tolerates binary bodies on the screenshot path.

## Debugging Verification Failures

1. **Log both signatures side-by-side** (the computed expected and the received header) — they should be identical, byte for byte, after normalising case.
2. **Log the body length** received vs. the `Content-Length` header. A mismatch means a middleware ate the body.
3. **Hash a known string with your secret** locally and compare with Scrapfly's documented Python sample:
   ```python
   hmac.new(b'YOUR-SECRET', b'{"data": "example"}', hashlib.sha256).hexdigest().upper()
   ```
4. **Check the right header.** `X-Scrapfly-Webhook-Signature` (uppercase hex) — not `Signature`, not `X-Signature`, not `webhook-signature`.
5. **Confirm you're using the right secret.** Webhooks are scoped per project + environment; the dashboard shows the secret for the specific webhook.
