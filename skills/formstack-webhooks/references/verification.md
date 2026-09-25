# How to Verify Formstack Webhook Signatures

## How It Works

Formstack computes **HMAC-SHA256 over the raw request body bytes**, keyed with the
WebHook's **HMAC Key**, and sends the digest as **lowercase hex** in a header — by default
`X-FS-Signature`.

| Property | Value |
|---|---|
| Algorithm | HMAC-SHA256 |
| Encoding | Lowercase hex |
| Header | `X-FS-Signature` by default, **user-overridable** |
| Key | The per-WebHook "HMAC Key" string |
| Signed content | The **raw request body bytes**, and nothing else |
| Prefix | `sha256=<hex>` on real deliveries. Strip it, and tolerate a bare digest too |
| Standard Webhooks? | **No.** There is no `webhook-id`, `webhook-timestamp` or `webhook-signature` |

**Nothing but the body is signed.** No timestamp, no nonce, no URL, no method, no field
concatenation.

## Where These Facts Come From — Read This

Be honest about sourcing, because the algorithm and encoding are not in the vendor's current
public docs. They are confirmed by observation instead.

**Documented by Formstack today:**

- The header name. The help article states verbatim: *"If left blank, X-FS-Signature will
  be used as the HMAC header."* (The Custom HMAC Header option shipped in the February 2025
  Formstack release.)
- The existence of the "HMAC Key" field, and that it is optional.
- The v2025 API reference confirms `hmacSecret` ("HMAC secret used for signing webhook
  payload data") and `customHmacHeader` ("Custom HMAC header name") exist.

**NOT documented by Formstack today:**

- **The algorithm and the encoding.** The help article never names them. The developer page
  that did — `developers.formstack.com/v2.0/docs/webhook-setup`, still linked from the
  bottom of the help article — now returns **404**, and the current
  `developers.formstack.com` documents only the webhook CRUD API, whose schema confirms the
  fields exist but not the digest format.

**So where does SHA-256 + hex come from?** From **real deliveries.** Two live WebHook submit
actions were captured through a Hookdeck source on 2026-09-25, on a form with URL Encoded Form
Data (the default) and no answer fields. Each body was 52 bytes:

```
content-type: application/x-www-form-urlencoded; charset=utf-8
user-agent: FormstackWebhook/1.0 (Form 6606394)
x-fs-signature: sha256=30dff7f180b6d69eab397a5d51719474df490b730514c253e8b5832d3b51b970

FormID=6606394&UniqueID=1500878955&HandshakeKey=test
```

With the HMAC Key `test1`, HMAC-SHA256 over those exact body bytes reproduces the header's
digest as lowercase hex:

```bash
printf '%s' 'FormID=6606394&UniqueID=1500878955&HandshakeKey=test' \
  | openssl dgst -sha256 -hmac test1 -r
# 30dff7f180b6d69eab397a5d51719474df490b730514c253e8b5832d3b51b970
```

What the two captures settle:

- **Algorithm and encoding.** HMAC-SHA256, lowercase hex. The base64 form of the same MAC
  (`MN/38YC21p6rOXpdUXGUdN9JC3MFFMJT6LWDLTtRuXA=`) does not match.
- **The prefix.** The header value is `sha256=` followed by the hex digest.
- **The key.** The first delivery was signed with HMAC Key `test`. The key was then changed to
  `test1`, and the second delivery verified with `test1` and not with `test`. The HMAC Key is
  used directly as the HMAC key bytes, with no derivation.
- **Signed content.** The raw urlencoded body and nothing else. There is no timestamp or nonce
  header to include.

This is also what **Hookdeck's own `FORMSTACK` source integration** implements, as an alias
of its generic HMAC controller with `sha256` / `x-fs-signature` / `hex`, so a Hookdeck source
verifies the same deliveries your handler does.

The express, nextjs and fastapi test suites each verify the captured delivery above as a
test vector, so a regression in the verifier fails against a real Formstack signature rather
than one the tests generated themselves.

## Not FastSpring

FastSpring (fastspring.com — unrelated e-commerce company) uses the **same header name**,
`X-FS-Signature`. It is a different scheme:

| | Formstack | FastSpring |
|---|---|---|
| Digest encoding | **hex** | **base64** |
| Payload | Flat field map | `{ "events": [ ... ] }` envelope |
| Content type | urlencoded (default) or JSON | JSON |

If you find yourself writing `.digest('base64')`, or iterating an `events` array for
Formstack, you have imported FastSpring's scheme by mistake.

## Fail Closed

Signing is **optional and off by default** — Formstack sends no signature at all unless the
form owner sets an HMAC Key on the WebHook. That makes "no secret configured, accept anyway"
a tempting fallback. **Never do it.** An attacker who knows your endpoint URL can otherwise
post arbitrary submissions.

Treat verification as **required in production**:

- Configured secret missing or empty → **reject**.
- Signature header absent → **reject**.
- Digest mismatch → **reject**.

Configuring an HMAC Key is therefore the **first** setup step, not the last.

## Implementation

There is **no Formstack SDK for webhook verification** — no official library exists. Use
stdlib `crypto` / `hmac`. Do not add a Formstack package to `package.json` or
`requirements.txt`; you would be inventing a dependency that breaks `npm install` /
`pip install`.

### Node.js

```javascript
const crypto = require('crypto');

function verifyFormstackWebhook(rawBody, signatureHeader, hmacKey) {
  // Fail closed: an unset key must never mean "accept anyway".
  if (!signatureHeader || !hmacKey) return false;

  // Formstack sends `sha256=<hex>`. Strip the prefix (tolerating its absence), trim, lowercase.
  const received = signatureHeader.trim().replace(/^sha256=/i, '').trim().toLowerCase();
  const expected = crypto.createHmac('sha256', hmacKey).update(rawBody).digest('hex');

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first — timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib
import hmac
import re

def verify_formstack_webhook(raw_body: bytes, signature_header, hmac_key) -> bool:
    if not signature_header or not hmac_key:  # fail closed
        return False
    received = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.I).strip().lower()
    expected = hmac.new(hmac_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare as BYTES: compare_digest raises TypeError on non-ASCII str, and header
    # values arrive latin-1 decoded, so str comparison turns a hostile header into a 500.
    return hmac.compare_digest(received.encode("utf-8", "replace"), expected.encode("ascii"))
```

## Reading the Header Name from Config

The header name is **user-overridable** — the WebHook's "Custom HMAC Header" field replaces
`X-FS-Signature` when set. Hardcoding the header name breaks the moment someone fills that
field in. Read it from an environment variable that **defaults** to `x-fs-signature`:

```javascript
const headerName = (process.env.FORMSTACK_SIGNATURE_HEADER || 'x-fs-signature').toLowerCase();
const signature = req.headers[headerName];
```

Read it **lowercased**: Express, Next.js and FastAPI all expose headers lowercased, and
HTTP header names are case-insensitive anyway. Hookdeck's own Formstack source exposes
exactly this as an optional "Signature Header Key" override with placeholder
`x-fs-signature`.

## The Gotcha That Will Actually Bite You: Raw Body for urlencoded

**The default content type is `application/x-www-form-urlencoded`, and the digest covers the
raw urlencoded bytes — not a re-encoded form of the parsed dict.**

Re-encoding a parsed body:

- **reorders keys** (object/dict iteration order is not the wire order),
- **re-escapes characters** (`+` vs `%20`, which characters get percent-encoded, `%2F` vs `/`),
- **drops or merges duplicates**.

Any one of those changes the bytes, and the digest will never match. This is the single most
likely place a Formstack implementation goes wrong.

Capture the raw body **before** parsing, and cover **both** content types, because the same
handler is commonly pointed at several forms configured by different people.

### Express

```javascript
const saveRaw = (req, res, buf) => { req.rawBody = buf; };

app.post('/webhooks/formstack',
  express.urlencoded({ extended: true, verify: saveRaw }),  // default content type
  express.json({ verify: saveRaw }),                        // if contentType is json
  handler);
```

Both parsers are needed. Each is a no-op when the request's content type doesn't match, so
chaining them covers `urlencoded` and `json` WebHooks with one route. `req.rawBody` is the
exact bytes; `req.body` is the parsed result you use *after* verifying.

### Next.js (App Router)

```typescript
const raw = await req.text();   // byte-exact, before any parsing

const contentType = req.headers.get('content-type') ?? '';
const fields = contentType.includes('application/json')
  ? JSON.parse(raw)
  : Object.fromEntries(new URLSearchParams(raw));
```

Do **not** call `req.formData()` or `req.json()` first — you cannot recover the original
bytes afterwards.

### FastAPI

```python
raw = await request.body()      # bytes, before parsing

content_type = request.headers.get("content-type", "")
if "application/json" in content_type:
    fields = json.loads(raw)
else:
    fields = dict(urllib.parse.parse_qsl(raw.decode("utf-8")))
```

Do **not** use `await request.form()` before verifying.

## Prefix Handling

Real deliveries send the digest prefixed:

```
X-FS-Signature: sha256=30dff7f180b6d69eab397a5d51719474df490b730514c253e8b5832d3b51b970
```

Strip a leading `sha256=` **case-insensitively**, trim whitespace, then compare. Comparing the
raw header value against a bare hex digest rejects every delivery. Tolerating a bare digest as
well costs nothing, and Hookdeck's HMAC controller does the same.

## Constant-Time Comparison

Use `crypto.timingSafeEqual` (Node) / `hmac.compare_digest` (Python), never `===` or `==`.

- **Guard the length first.** `timingSafeEqual` *throws* on a length mismatch — a truncated
  header would become a 500 instead of a clean rejection.
- **Normalise case before comparing hex**, so an uppercase digest isn't falsely rejected.
- In Python, compare **bytes**, not `str`: `compare_digest` raises `TypeError` on non-ASCII
  `str` arguments, and header values arrive latin-1 decoded, so a hostile header value would
  otherwise become an unhandled 500.

## Replay: There Is None

**No timestamp and no nonce are in the signed content**, so a captured Formstack delivery is
**replayable indefinitely**. There is no staleness window to enforce and inventing one would
be dishonest.

Mitigate instead:

- **Idempotency keyed on `UniqueID`**, falling back to a hash of the raw body when absent.
- **HTTPS-only endpoints**, so deliveries aren't captured in the first place.
- Optionally, firewall allowlisting of Formstack's published source IPs — as defence in
  depth, never as a replacement for the HMAC.

## Common Gotchas

| Symptom | Cause |
|---|---|
| Digest never matches on urlencoded bodies | You re-encoded the parsed body. Sign the raw bytes |
| Digest never matches on JSON bodies | `JSON.parse` → `JSON.stringify` round-trip changed the bytes |
| Every delivery rejected after a config change | Someone set "Custom HMAC Header"; your code hardcodes `x-fs-signature` |
| No signature header at all | No HMAC Key is set on that WebHook. Set one — don't add an unsigned fallback |
| Every delivery rejected, lengths 71 vs 64 | You compared the raw header instead of stripping `sha256=` |
| `timingSafeEqual` throws | No length guard before the comparison |
| Uppercase hex rejected | No case normalisation before comparing |
| Wrong key entirely | You used the API client secret / access token / PAT. The HMAC Key is per-WebHook and separate |
| Works on form A, fails on form B | Each WebHook has its own HMAC Key. There is no account-wide secret |

## Debugging Verification Failures

1. **Log the raw body as bytes**, not the parsed object. A parsed dict tells you nothing
   about the bytes that were signed.
2. **Compare lengths.** A 64-character expected digest versus a 71-character header means
   you did not strip the `sha256=` prefix.
3. **Check the key by hand** against one captured delivery:

   ```bash
   RAW='FormID=1234567&UniqueID=9876543210&Name=Jane+Smith'
   printf '%s' "$RAW" | openssl dgst -sha256 -hmac "$FORMSTACK_HMAC_KEY" -r
   ```

   `printf` (not `echo`) — a trailing newline changes the digest.
4. **Confirm which header actually arrived.** Dump all request headers once; the Custom
   HMAC Header field may be set.
5. **Confirm you're testing the right WebHook.** A form can have several, each with its own
   key.
6. **Check for proxy rewriting.** Anything that re-chunks, re-encodes, or normalises the
   body between Formstack and your handler breaks the digest.
