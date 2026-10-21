# How to Verify LINE Webhook Signatures

## How It Works

Every webhook from the LINE Platform includes an `x-line-signature` header:

```
x-line-signature = base64( HMAC-SHA256( key = channel secret, message = raw request body ) )
```

- **Algorithm**: HMAC-SHA256
- **Key**: the channel secret (LINE Developers Console → channel → **Basic settings**), used as-is (UTF-8 bytes; no base64 decoding, no prefix)
- **Signed content**: the raw request body, nothing else. There's no timestamp or ID in the signed string.
- **Encoding**: standard base64 (with `+`, `/`, `=` padding)
- **Not Standard Webhooks**: there are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers

Missing header or mismatch → don't process the events, return an error (the examples return `400`).

### Official Test Vector

From LINE's [Verify webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/) docs:

| | Value |
|-|-------|
| Channel secret | `8c570fa6dd201bb328f1c1eac23a96d8` |
| Body | `{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}` |
| `x-line-signature` | `GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=` |

```bash
echo -n '{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}' \
  | openssl dgst -sha256 -hmac '8c570fa6dd201bb328f1c1eac23a96d8' -binary | openssl base64
# GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs=
```

All three examples include this vector in their tests.

## Implementation

### SDK Verification (recommended)

**Node.js — `@line/bot-sdk`** (v11 requires Node.js 22+):

```javascript
const { validateSignature } = require('@line/bot-sdk');

// rawBody: Buffer or string, exactly as received
const ok = validateSignature(rawBody, process.env.LINE_CHANNEL_SECRET, req.headers['x-line-signature']);
```

`validateSignature(body, channelSecret, signature)` computes the HMAC, base64-decodes the header, and compares with `crypto.timingSafeEqual` after a length check. Wrap it in `try/catch` and treat missing headers as invalid before calling it.

The SDK also ships `middleware({ channelSecret })` for Express. It verifies and parses in one step, but it responds `401` on failure and must run **before** any `express.json()` on that route. The examples call `validateSignature` directly to control the response and keep verification visible.

**Python — `line-bot-sdk`** (v3, Python 3.10+):

```python
from linebot.v3 import SignatureValidator

# validate() takes the body as text; decode the raw bytes as UTF-8 (LINE always sends UTF-8)
ok = SignatureValidator(channel_secret).validate(raw_body.decode("utf-8"), signature)
```

`WebhookParser(channel_secret).parse(body, signature)` verifies and parses in one step, raising `InvalidSignatureError` on failure.

### Manual Verification (no SDK)

**Node.js:**

```javascript
const crypto = require('crypto');

function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const expected = crypto.createHmac('sha256', channelSecret).update(rawBody).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

**Python:**

```python
import base64, hashlib, hmac

def verify_line_signature(raw_body: bytes, signature: str, channel_secret: str) -> bool:
    if not signature or not channel_secret:
        return False
    digest = hmac.new(channel_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)
```

## How to Get the Raw Body

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: '*/*' })` on the webhook route → `req.body` is a `Buffer` |
| Next.js (App Router) | `Buffer.from(await request.arrayBuffer())` (or `await request.text()`), Node.js runtime |
| FastAPI | `await request.body()` → `bytes` |

## Common Signature Verification Errors

LINE's docs list these as the usual causes:

- **Body parsed before verifying**: `express.json()`, `JSON.parse` → `JSON.stringify`, or `json.loads` → `json.dumps` changes whitespace, quotes, key order and escapes. Verify the exact bytes received.
- **Body pretty-printed or reformatted** for logging before verification.
- **Escape sequences interpreted**: bodies can contain `\n`, `\\` and `\uXXXX`. In shell tests use single quotes with `echo -n`/`printf '%s'`; in Python use raw strings for test fixtures.
- **Not UTF-8**: LINE sends `application/json; charset=utf-8`. Decoding with another charset can turn LF into CRLF or mangle emoji.
- **Wrong algorithm**: HMAC-SHA1 or plain SHA-256 instead of HMAC-SHA256.
- **Wrong channel**: each channel has its own secret. The body's `destination` tells you which bot the request is for.
- **Secret reissued**: another admin clicked **Issue** on Basic settings; the old secret stops working immediately.
- **Using the channel access token** as the key instead of the channel secret.
- **A proxy or load balancer rewrote the body or headers** before your server.
- **Hex vs base64**: the header is base64. Comparing against a hex digest always fails.

## How to Debug Verification Failures

1. Run the official test vector above through your function. If it fails, your algorithm or encoding is wrong.
2. Log the length and SHA-256 of the raw body you're verifying, and compare with what the sender reported (e.g. in the Hookdeck CLI's request inspector).
3. Check that `LINE_CHANNEL_SECRET` matches **Basic settings** of the channel named in `destination`, with no surrounding whitespace or quotes.
4. Look at **Statistics** on the Messaging API tab (with error statistics aggregation enabled) to see what LINE recorded for failed deliveries.
5. Make sure the empty-`events` **Verify** request also passes. It's signed the same way.
