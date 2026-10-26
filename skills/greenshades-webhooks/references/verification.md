# How to Verify Greenshades Webhook Signatures

## How It Works

Greenshades signs every delivery with HMAC-SHA256 keyed by the `hmacKey` you chose. From the docs: "To generate the HMAC hash, use the concatenation result of `[timestamp]\n[request body]`."

| Item | Value |
|------|-------|
| Signature header | `X-GS-SIGNATURE`: bare lowercase hex digest, no prefix |
| Timestamp header | `X-GS-TIMESTAMP`: the timestamp used for the hash (format not documented) |
| Algorithm | HMAC-SHA256 |
| Signed message | `X-GS-TIMESTAMP` value, `0x0A`, raw request body bytes |
| Key | The `hmacKey` as UTF-8 bytes, used as-is |

Greenshades' C# recipe:

```csharp
var content = $"{timestamp}\n{body}";
var signature = GenerateHmacSignature(content);
var isSafe = signature == Request.Headers["X-GS-SIGNATURE"].First().ToString();
```

This matches Hookdeck's Greenshades source: HMAC, SHA-256, header `x-gs-signature`, hex encoding, signed content `{header:x-gs-timestamp}\n{body}`.

## Implementation

Both examples build the message as bytes, validate the digest's format, then compare in constant time.

### Node.js

```javascript
const message = Buffer.concat([
  Buffer.from(timestamp, 'latin1'), // header value exactly as received
  Buffer.from('\n'),                // one real LF (0x0A)
  rawBody                           // Buffer from express.raw / arrayBuffer
]);
const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
const received = Buffer.from(signature.toLowerCase(), 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

### Python

```python
message = timestamp.encode("latin-1") + b"\n" + raw_body
expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
    return False
return hmac.compare_digest(bytes.fromhex(signature), expected)
```

Rules the examples follow:

- Never call `Buffer.from(sig, 'hex')` on an unvalidated value; it silently drops bad characters.
- Use `hmac.compare_digest` on `bytes`, never `str`.
- Hex is case-insensitive, as in Hookdeck: require exactly 64 hex characters and lowercase or decode both sides.
- Compare the whole header value as one digest. No list splitting or prefix parsing.
- Header values are encoded latin1 and never trimmed or re-formatted.

## Common Gotchas

- **Raw body.** Verify the bytes as received. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`; FastAPI: `await request.body()`. Parse only after the check.
- **Real newline.** The separator is LF (`0x0A`). The docs write it as `\n`; in code that is a normal string escape, not a literal backslash and `n`. A test in each example asserts the signed bytes contain `0x0A` and not `\n` as two characters.
- **ASCII vs UTF-8.** Greenshades' C# recipe encodes key and content as ASCII. Hookdeck and the examples sign UTF-8 body bytes, which only differs for a non-ASCII body or key.
- **Not a test vector.** The recipe's "Response Example" hash uses placeholder inputs. Generate vectors from your own key.
- **Timestamp window.** Off by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance. Set `GREENSHADES_WEBHOOK_TOLERANCE_SECONDS` to opt in; the timestamp is then parsed as epoch seconds, epoch milliseconds or an ISO date, because the format is undocumented. Unparseable values are rejected when it is on. Use idempotency to handle replays instead.
- **HTTP method.** Undocumented. The examples verify GET, POST, PUT, PATCH and DELETE, and treat a missing body as empty bytes.
- **Status codes.** Missing or empty header, malformed digest or mismatch: `401`. Valid signature but invalid JSON: `400`. Secret not configured: `500`.

## Debugging Verification Failures

1. Log the raw body length and `X-GS-TIMESTAMP`; compare with what Greenshades sent (Hookdeck's request view shows both).
2. Confirm `GREENSHADES_WEBHOOK_SECRET` equals the subscription's `hmacKey` exactly, with no trailing newline from `.env` editing.
3. Check no middleware parses or re-serializes the body before verification.
4. Recompute with a one-off script over the saved raw body and headers; a mismatch with correct inputs points to the wrong key.
5. If a proxy rewrites headers, remember the timestamp is used verbatim; trimmed or re-formatted values break the hash.
