# How to Authenticate Meilisearch Webhooks

## How It Works

Meilisearch **does not sign payloads**: there is no HMAC, timestamp or signature header. The
only credential is the `Authorization` header you configured:

```
Authorization: Bearer your-secret-token
```

The docs say: "Always validate the Authorization header on incoming webhook requests."

- The key is the **whole header value** exactly as set in Meilisearch, including any
  `Bearer ` or `Basic ` prefix. Compare the full header to `MEILISEARCH_AUTHORIZATION`.
  Don't strip, parse or base64-decode the prefix.
- Missing header or mismatch: respond `401`.

> **Limits of a static credential.** A shared secret authenticates the sender, not the body,
> and gives no replay protection (no signature, no timestamp). Anyone who captures a request
> can replay it. Use HTTPS, make handlers idempotent (dedupe on task `uid` and `status`), and
> rotate the credential if it leaks.

## Reading the Body

The body is gzip-compressed ndjson (`Content-Encoding: gzip`, `Content-Type:
application/x-ndjson`). Order of operations:

1. Read the **raw bytes** (not text, not parsed JSON).
2. Check the `Authorization` header. Fail with `401`.
3. If `Content-Encoding` is gzip, decompress. Fail with `400` if undecodable.
4. Split on newlines; `JSON.parse` / `json.loads` every non-empty line. Never parse the whole
   body as one JSON document. Fail with `400` on a bad line.
5. Handle each task, return `2xx`.

## Implementation

There is no SDK. Verification is a constant-time string comparison. Hash both sides first so
the buffers are equal length: `timingSafeEqual` throws on a length mismatch otherwise (or
check lengths first).

### Node.js (Express)

```javascript
const crypto = require('crypto');
const zlib = require('zlib');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authenticate(req, res, next) {
  const expected = process.env.MEILISEARCH_AUTHORIZATION;
  const received = req.headers['authorization'];
  if (!expected || !received || !safeEqual(received, expected)) return res.status(401).end();
  next();
}

// body-parser gunzips by itself, so hide Content-Encoding from it and gunzip the raw
// bytes yourself (undecodable bodies then map to a clean 400).
function keepContentEncoding(req, res, next) {
  req.contentEncoding = req.headers['content-encoding'];
  delete req.headers['content-encoding'];
  next();
}

app.post(
  '/webhooks/meilisearch',
  authenticate,
  keepContentEncoding,
  express.raw({ type: '*/*' }),
  (req, res) => {
    const raw = /\bgzip\b/i.test(req.contentEncoding || '') ? zlib.gunzipSync(req.body) : req.body;
    const tasks = raw.toString('utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
    // ...
  }
);
```

If you leave body-parser's default `inflate`, `req.body` is already decompressed; don't
gunzip it twice.

### Next.js (App Router)

```typescript
const received = request.headers.get('authorization'); // Headers is case-insensitive
// compare with safeEqual(received, process.env.MEILISEARCH_AUTHORIZATION!)
const raw = Buffer.from(await request.arrayBuffer()); // not request.text()
const text = zlib.gunzipSync(raw).toString('utf8');
```

### Python (FastAPI)

```python
import gzip, hashlib, hmac, json

def safe_equal(a: str, b: str) -> bool:
    # compare_digest on bytes: never pass str, which raises on non-ASCII
    return hmac.compare_digest(
        hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest()
    )

# headers.get("authorization") vs os.environ["MEILISEARCH_AUTHORIZATION"]
raw = await request.body()
if "gzip" in request.headers.get("content-encoding", "").lower():
    raw = gzip.decompress(raw)
tasks = [json.loads(l) for l in raw.decode().splitlines() if l.strip()]
if not all(isinstance(t, dict) for t in tasks):
    raise ValueError("expected one JSON object per line")
```

## Common Gotchas

- **Prefix dropped**: if you store only the token, the comparison fails. Keep `Bearer ` /
  `Basic ` in the stored value.
- **`JSON.parse` on the whole body** throws as soon as there are two tasks. Parse per line.
- **Reading the body as text** corrupts gzip bytes. Use `arrayBuffer()` / `await request.body()`.
- **Double decompression**: some frameworks (Express body-parser) gunzip automatically.
- **Unconfigured secret**: reject everything if `MEILISEARCH_AUTHORIZATION` is empty, otherwise
  an empty header would "match".
- **Optional header**: Meilisearch lets you omit the Authorization header; always set one.
- **Hookdeck**: events show a binary body because Hookdeck stores gzip as binary; it forwards
  the original bytes and `Content-Encoding`. A Hookdeck Meilisearch source (type `MEILISEARCH`)
  compares the same whole header value.

## Debugging 401s

1. Log which header names arrive, without logging values.
2. Confirm `Authorization` is present and compare lengths (a missing `Bearer ` prefix is a
   7-character difference).
3. Check for trailing whitespace or quotes in `.env`.
4. Confirm the value matches what the webhook was created with (Cloud settings, the
   `--task-webhook-authorization-header` flag or the `/webhooks` API).
