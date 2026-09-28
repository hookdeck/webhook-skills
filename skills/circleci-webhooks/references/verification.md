# How to Verify CircleCI Webhook Signatures

## Why Signature Verification Matters

Your CircleCI webhook endpoint is a public HTTPS URL. Anyone who finds it can
POST whatever they like — a fabricated `workflow-completed` with
`workflow.status: "success"` is a trivially forged "deploy this to production"
instruction. The HMAC signature is the **only** thing that proves a delivery
came from CircleCI. There is **no documented source-IP allowlist** to fall back
on; don't invent one.

## The Scheme at a Glance

| | |
|---|---|
| Header | `circleci-signature` (lowercase in the docs) |
| Format | Comma-separated `<version>=<signature>` pairs, e.g. `v1=4fcc06…,v2=…,v3=…` |
| Version to use | **`v1` only** — the latest and, today, the only version |
| Algorithm | **HMAC-SHA256** |
| Encoding | **Lowercase hex**, 64 characters (not base64) |
| Signed content | **The raw request body bytes, alone** |
| Prefix / delimiter | **None** — no timestamp, no id, no `.` separator |
| Key | The webhook's **Secret token** (API field `signing-secret`), used as **UTF-8 bytes directly** |
| Timestamp / replay window | **None exists** |
| Comparison | Constant-time |

CircleCI's docs, verbatim:

> "Each outgoing HTTP request to your service will contain a
> `circleci-signature` header. This header will consist of a comma-separated
> list of versioned signatures."

> "Currently, the latest (and only) signature version is v1. Only check the
> latest signature type to prevent downgrade attacks."

> "The v1 signature is the HMAC-SHA256 digest of the request body, using the
> configured signing secret as the secret key."

And their Python sample, which fixes the key handling beyond doubt:

```python
hmac.new(bytes(secret, 'utf-8'), bytes(body, 'utf-8'), 'sha256').hexdigest()
```

No base64 decode. No prefix strip. The secret string's UTF-8 bytes *are* the key.

## Implementation

### No SDK exists

**CircleCI publishes no SDK helper for webhook verification** in any language.
The manual HMAC above is the only supported path. Do not install an `npm` or
`pip` package claiming to verify CircleCI webhooks — there isn't an official one.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyCircleCISignature(rawBody, signatureHeader, secret) {
  // Fail closed: no header, or no configured secret, is a rejection.
  if (!signatureHeader || !secret) return false;

  // Comma-separated `<version>=<signature>` pairs. Split each pair on the
  // FIRST '=' so a signature value containing '=' can never be truncated.
  let v1 = null;
  for (const pair of signatureHeader.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === 'v1') {
      v1 = pair.slice(eq + 1).trim();
      break;
    }
  }

  // No v1 entry -> REJECT. Never fall back to v2/v3: their algorithm is
  // unknown, and accepting them is exactly the downgrade attack the docs warn
  // about.
  if (!v1) return false;

  // Sign the RAW BODY BYTES ONLY. The secret is used as UTF-8 bytes directly.
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Length guard BEFORE timingSafeEqual, which throws on mismatched lengths.
  const a = Buffer.from(v1, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Express must hand you the raw bytes:

```javascript
app.post('/webhooks/circleci', express.raw({ type: 'application/json' }), handler);
```

Next.js App Router:

```typescript
const rawBody = await request.text();   // BEFORE any request.json()
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_circleci_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:     # fail closed
        return False

    v1 = None
    for pair in signature_header.split(","):
        version, sep, sig = pair.strip().partition("=")   # FIRST '=' only
        if sep and version.strip() == "v1":
            v1 = sig.strip()
            break
    if not v1:                                  # no v1 -> reject, no downgrade
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # constant time, length-safe. Compare BYTES: with str arguments
    # compare_digest raises TypeError on a non-ASCII (attacker-supplied) header.
    return hmac.compare_digest(v1.encode("utf-8"), expected.encode("utf-8"))
```

```python
raw_body = await request.body()   # raw bytes, before any json parsing
```

## Known-Answer Test Vectors

From CircleCI's validation guide, all four verified locally. Use them as unit
tests — they isolate the algorithm from your framework's body handling:

| Body | Secret | `v1` signature |
|---|---|---|
| `hello world` | `secret` | `734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a` |
| `lalala` | `another-secret` | `daa220016c8f29a8b214fbfc3671aeec2145cfb1e6790184ffb38b6d0425fa00` |
| `an-important-request-payload` | `hunter123` | `9be2242094a9a8c00c64306f382a7f9d691de910b4a266f67bd314ef18ac49fa` |
| `foo` | `secret` | `773ba44693c7553d6ee20f61ea5d2757a9a4f4a44d2841ae4e95b52e4cd62db4` |

Reproduce at a shell (`printf`, not `echo` — a trailing newline changes the
digest):

```bash
printf '%s' 'hello world' | openssl dgst -sha256 -hmac 'secret' -r | cut -d' ' -f1
# 734cc62f32841568f45715aeb9f4d7891324e6d948e4c6c60c0621cdac48623a
```

## Common Signature Verification Errors

### Parsing the versioned list wrong

`v1=abc,v2=def` is **not** `header.split('=')[1]`. Split on `,` first, then on
the **first** `=` of each pair, and select the pair whose key is exactly `v1`.

A real header may carry extra versions (`v1=…,v2=…,v3=…`). Ignore them — a
handler that trips over unknown versions will break the moment CircleCI adds one.

### Falling back to v2/v3 when v1 is missing

This is the **downgrade attack** CircleCI explicitly warns against. `v2` and `v3`
don't exist yet; their algorithm is unknown. If there's no `v1` entry, **reject**.
Never compute SHA-256 over a `v2` value and accept it because the lengths match.

### Parsing the body before verifying

`express.json()` mounted ahead of the route, or `await request.json()` before
`request.text()`, replaces the bytes with a re-serialization. Key order,
whitespace, and unicode escaping can all differ — the digest won't match. Always
verify the **raw bytes**, then parse.

### Re-serializing with `JSON.stringify`

Same failure in a different costume. `JSON.stringify(req.body)` is not the body
CircleCI signed; it only ever agrees by luck.

### `timingSafeEqual` throwing a 500

Node's `crypto.timingSafeEqual` **throws** when the buffers differ in length. A
truncated or garbage signature then becomes an uncaught 500, which CircleCI
retries. Check `a.length === b.length` first, or wrap in `try`/`catch`. Python's
`hmac.compare_digest` handles differing lengths safely, but raises `TypeError`
when given a `str` containing non-ASCII characters, so encode both sides to
`bytes` before comparing.

### Inventing a timestamp or replay window

There is **no `circleci-timestamp` header** and **no documented replay
tolerance**. Some handlers reject on `happened_at` — don't. It is *event* time,
not a signing input, and a legitimate retry (CircleCI doesn't document when
retries happen) carries the original value. You'd silently drop real deliveries. Replay protection here is
**deduplication on the payload `id`**.

### Base64-decoding the secret

The secret is whatever string you typed into the **Secret token** field, used as
**UTF-8 bytes**. There is no `whsec_`-style prefix and no base64 encoding.
`base64.b64decode(secret)` will either throw or produce garbage.

### Comparing hex as bytes vs as text

Both work as long as you're consistent. Comparing the hex **strings** (as above)
is simplest. If you `Buffer.from(sig, 'hex')` instead, remember that an
odd-length or non-hex string decodes silently to a shorter buffer — which is why
the length guard still matters.

### Using the CircleCI API token as the secret

`Circle-Token` is for calling CircleCI. The webhook Secret token is for CircleCI
calling you. Different secrets.

## Unsigned Requests

The Secret token is **optional in the web UI** (`Secret token: N`) and the
docs' header table says the signature is sent *"When present"*. So a webhook
configured without a secret delivers requests with **no `circleci-signature`
header at all**.

**Do not treat a missing header as permission to skip verification.** Require the
secret and fail closed:

- Missing `circleci-signature` → **400**, rejected.
- `CIRCLECI_WEBHOOK_SECRET` unset on your side → **500**, rejected. A 500 makes
  CircleCI retry, so a fixed misconfiguration recovers without data loss —
  whereas a 200 would silently swallow real events.

The examples in this skill do exactly that.

## Is This Standard Webhooks?

**No.** Standard Webhooks (Svix) uses `webhook-id` / `webhook-timestamp` /
`webhook-signature` with base64 over `{id}.{timestamp}.{body}`. CircleCI uses a
single `circleci-signature` header with **hex** over the **body alone** and **no
timestamp**. Superficially similar version prefixes, completely different scheme
— don't reach for an `svix` package.

## How to Debug Verification Failures

1. **Log the raw header.** Confirm it exists and looks like `v1=<64 hex chars>`.
   Missing header ⇒ no Secret token configured on the webhook.
2. **Check the `v1` value is 64 lowercase hex characters.** Anything else means
   you parsed the list wrong.
3. **Run the known-answer vectors** above through your verify function. If those
   fail, the bug is in your algorithm, not your plumbing.
4. **Compare byte lengths.** Log `rawBody.length` and confirm the type is
   `Buffer`/`bytes`, not a parsed object or a re-stringified value.
5. **Hexdump the first bytes** of the body. A leading BOM, a stray newline, or
   gzip bytes all mean the body isn't what CircleCI signed.
6. **Confirm the secret matches exactly.** Trailing whitespace or a newline
   pasted into `.env` is the classic one — `CIRCLECI_WEBHOOK_SECRET=abc `
   silently includes the space.
7. **Check middleware order.** Any body parser registered ahead of the webhook
   route will break it.
8. **Check for a proxy rewriting the body.** Some gateways reformat JSON or strip
   charset; verify at the edge, or configure pass-through.

## Official Documentation

- [Validate webhooks](https://circleci.com/docs/guides/integration/outbound-webhooks/#validate-webhooks)
- [Outbound webhooks guide](https://circleci.com/docs/guides/integration/outbound-webhooks/)
