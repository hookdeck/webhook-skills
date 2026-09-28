# How to Verify Checkout.com Webhook Signatures

## Why Signature Verification Matters

Your Checkout.com webhook endpoint is a public HTTPS URL. Anyone who finds it
can POST `{"type":"payment_captured", ...}` at it. Without verification, that
ships an order for a payment that never happened. `Cko-Signature` is what proves
a request came from Checkout.com **and** that nobody changed the body in flight.

## How It Works

Checkout.com configures **two independent, optional** mechanisms per webhook.
Source: [Receive webhooks](https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks) and
[Configure your webhook server → Validate the payload](https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks/configure-your-webhook-server#Validate_the_payload).

### 1. `Cko-Signature` — HMAC-SHA256, hex (the one that matters)

Checkout.com, verbatim from *Receive webhooks*:

> "Checkout.com generates the HMAC by hashing the webhook payload using the key
> you provide in your workflow's webhook action, and then sends it in the
> hex-encoded (Base16) `Cko-Signature` header."

And from *Configure your webhook server → Validate the payload*:

> "Hash the payload with the SHA-256 hash function, using your webhook signature
> key as the hash key."
> "Compare the resulting HMAC with the one received in the `Cko-Signature`
> header."
> "To avoid signature verification inconsistencies, perform the signature
> calculation based on the raw payload body from the HTTP request."

| Property | Value |
|---|---|
| Header | `Cko-Signature` (read case-insensitively; Node/Express exposes `req.headers['cko-signature']`) |
| Algorithm | HMAC-SHA256 |
| Encoding | **Hex (Base16)**, lowercase in practice |
| Signed content | The **raw request body bytes**, nothing else |
| Prefix / structure | **None.** A bare digest — no `sha256=`, no `t=`, no version tag, exactly one signature |
| Key | The webhook **signature key**, used **as-is** as a UTF-8 string |
| Timestamp | **None exists.** No `Cko-Timestamp` header, no signed timestamp |

The value is the bare hex digest. Checkout.com's own WooCommerce plugin compares
PHP `hash_hmac('sha256', $raw, $key)` (lowercase hex) with `===`, which is why
lowercase is what you see in practice — lowercase the received value before
comparing anyway, for safety.

### 2. `Authorization` — a static shared key (optional)

Checkout.com, verbatim from *Configure your webhook server → Authenticate the
webhook*:

> "You can provide a key in the `Authorization` HTTP header of every webhook you
> receive to authenticate it on your server."

The configured key is sent **verbatim** — Checkout.com adds **no `Bearer ` or
`Basic ` prefix**. Compare the whole header value against your configured value
in constant time.

**This is a static bearer secret, not a signature.** It proves the sender knows
the key; it says nothing about whether the body was modified. Treat it as a
complement to `Cko-Signature`, never a replacement. A receiver that checks only
`Authorization` will happily process a tampered body.

Users may also add arbitrary extra static headers via "Add new header". They are
not part of verification.

## Implementation

### No SDK helper exists

Checkout.com's official SDKs (`checkout-sdk-node`, `checkout-sdk-python`, and
the rest) manage **workflows** — creating and updating webhook actions — but
**none of them exposes a webhook-signature verification function**. There is no
`checkout.webhooks.verify(...)`. Do the HMAC directly. Don't add
`checkout-sdk-node` as a dependency just for this.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyCkoSignature(rawBody, signatureHeader, signatureKey) {
  if (!signatureHeader || !signatureKey) return false;      // fail closed
  const expected = crypto
    .createHmac('sha256', signatureKey)  // key AS-IS as UTF-8 — do NOT decode it
    .update(rawBody)                     // RAW bytes — never re-serialized JSON
    .digest('hex');
  const a = Buffer.from(String(signatureHeader).trim().toLowerCase(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard FIRST — timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyAuthorizationKey(header, expectedKey) {
  if (!expectedKey) return true;   // not configured for this webhook — skip
  const a = Buffer.from(String(header || ''), 'utf8');
  const b = Buffer.from(expectedKey, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Express needs the raw body:

```javascript
app.post('/webhooks/checkout-com', express.raw({ type: '*/*' }), handler);
```

Next.js App Router gives you the raw text directly:

```typescript
const rawBody = await request.text();   // BEFORE any request.json()
```

### Python (FastAPI)

```python
import hashlib
import hmac

def verify_cko_signature(raw_body: bytes, signature_header: str | None, signature_key: str | None) -> bool:
    if not signature_header or not signature_key:
        return False                      # fail closed
    expected = hmac.new(
        signature_key.encode("utf-8"),    # key AS-IS as UTF-8 — do NOT decode it
        raw_body,                         # RAW bytes — never json.dumps(parsed)
        hashlib.sha256,
    ).hexdigest()
    # compare_digest needs BYTES: given str it raises TypeError on any
    # non-ASCII character, and Starlette decodes headers as latin-1.
    return hmac.compare_digest(
        signature_header.strip().lower().encode("utf-8"),
        expected.encode("utf-8"),
    )


def verify_authorization_key(header: str | None, expected_key: str | None) -> bool:
    if not expected_key:
        return True                       # not configured — skip
    return hmac.compare_digest(
        (header or "").encode("utf-8"),
        expected_key.encode("utf-8"),
    )
```

FastAPI:

```python
raw_body = await request.body()   # BEFORE await request.json()
```

## Common Gotchas

### Must use the raw body

Checkout.com spells it out: *"To avoid signature verification inconsistencies,
perform the signature calculation based on the raw payload body from the HTTP
request."* It warns that deserializing and re-serializing *"could change the
precision of some values"* and mangles special characters (©, ®, ™).

`JSON.parse` → `JSON.stringify` before hashing is the single most common cause
of a failing `Cko-Signature`. Parse **after** you verify:

```javascript
if (!verifyCkoSignature(rawBody, sig, key)) return res.status(401).send('Invalid signature');
const event = JSON.parse(rawBody.toString('utf8'));   // only now
```

In Express, mounting `express.json()` **before** the webhook route destroys the
raw body. Use `express.raw()` on that route, or mount `express.json()` after it.

### Don't decode the key

The signature key is a plain UTF-8 string — Checkout.com's own SDK test uses
`8V8x0dLK%AyD*DNS8JJr`. Base64- or hex-decoding it before HMAC produces a
completely different digest. Pass it straight in.

### Hex, not base64

`digest('hex')` / `.hexdigest()`. A base64 digest is 44 characters; a hex
SHA-256 digest is 64. If your computed value is 44 characters you have the wrong
encoding.

### There is no timestamp and no replay window

No `Cko-Timestamp` header exists and no timestamp is signed. **Do not invent a
tolerance check** — there is nothing to check it against, and copying a
Stripe-style `t=` parse will reject every delivery. Replay protection is
deduplication on the event `id` (`evt_…`).

Concretely: a byte-for-byte replay of a genuine delivery carries a genuinely
valid signature. Only idempotency stops it being processed twice.

### There is no prefix to strip

`Cko-Signature: <hex>`. Nothing else. Do not strip `sha256=`, do not split on
`,`, do not split on `;`. If your code does `header.split('=')[1]`, it is
shipping the wrong value.

### `timingSafeEqual` throws on length mismatch

Node's `crypto.timingSafeEqual` throws `RangeError` when the buffers differ in
length — which is exactly what a garbage signature produces. Guard the lengths
first (or wrap in `try`/`catch`). An uncaught throw becomes a 500, which
Checkout.com retries eight times over ~30 hours.

Python's `hmac.compare_digest` tolerates unequal lengths, but it **requires
bytes** once a value can be non-ASCII: given `str` arguments it raises
`TypeError: comparing strings with non-ASCII characters is not supported`.
Starlette decodes headers as latin-1, so a `Cko-Signature` containing a byte
above `0x7F` — or an authorization key an operator set to a non-ASCII string —
would turn a clean 401 into an unhandled 500 and burn all eight retries.
`.encode("utf-8")` both sides.

### Header case

HTTP header names are case-insensitive. Checkout.com sends `Cko-Signature`;
Node lowercases incoming headers, so read `req.headers['cko-signature']`.
FastAPI's `request.headers` is already case-insensitive.

### Fail closed on an unset secret

If `CHECKOUT_WEBHOOK_SIGNATURE_KEY` is missing, reject with a clear error.
Never fall through to "no secret configured, so accept everything" — that is an
open endpoint. The examples here return **500** for a missing secret (your
server is misconfigured), **401** for a bad or missing signature (the request is
wrong) and **400** for a body that isn't parseable JSON, so the three are
distinguishable in your logs.

## Legacy (Previous Platform) Accounts

Checkout.com's **previous ("ABC") platform** configured webhooks through the old
`/webhooks` endpoint and the Hub. Those docs are no longer published (the old
URLs 404). Checkout.com's Shopware 5 plugin reads the same `Cko-Signature` header and
computes the same HMAC-SHA256 hex digest, so the header, algorithm and encoding
appear unchanged (inferred from plugin source, not documented).

**Inferred from Checkout.com's own Shopware 5 plugin source, not from current
documentation:** that plugin accepts `Cko-Signature` if it matches
HMAC-SHA256 of the raw body keyed with **either** the configured webhook
signature key **or** the account's private/secret key. Evidence points to the
previous platform keying the HMAC with the account **secret API key**.

So, hedged and stated plainly: **if verification fails on a previous-platform
account, try your secret key as the HMAC key.** Nothing more than that is
claimed here. Don't build a speculative second verifier unless you have actually
confirmed your account is on the previous platform.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Signature never matches, body looks right | You hashed a re-serialized body. Hash the raw bytes. |
| Works in tests, fails in production | A proxy or body-parser is rewriting the body upstream. |
| Computed digest is 44 chars | You used base64. Use hex. |
| `RangeError: Input buffers must have the same byte length` | Missing length guard before `timingSafeEqual`. |
| Every delivery rejected as "too old" | You added a timestamp check. There is no timestamp — remove it. |
| `Cko-Signature` header is `undefined` in Express | Reading `Cko-Signature` instead of `cko-signature`. |
| Empty `req.body` | `express.json()` mounted before the route, or `express.raw()` missing. |
| Fails on one account, works on another | The other account may be on the previous platform — see above. |
| Fails after a key rotation | You rotated in the Dashboard but not in your env. |

### Isolate it

Log the raw body **as bytes** (length and a hash), not as a parsed object, then
recompute by hand:

```bash
# Save the raw body into body.json exactly as it arrived — byte for byte, no reformatting.
openssl dgst -sha256 -hmac "$CHECKOUT_WEBHOOK_SIGNATURE_KEY" < body.json
```

If that matches the `Cko-Signature` header but your server doesn't, the body
your server hashes is not the body that arrived — look at your middleware.

## Checklist

- [ ] Read the raw body **before** any JSON parsing
- [ ] HMAC-SHA256 with the signature key used **as-is** as a UTF-8 string
- [ ] `hex` digest, lowercased on both sides
- [ ] Compare the **whole** header value — no prefix stripping, no splitting
- [ ] Length guard before the constant-time compare
- [ ] **No** timestamp/replay tolerance check
- [ ] Also compare the `Authorization` header when you configured one
- [ ] Fail closed when the signature key is unset
- [ ] Deduplicate on the event `id` (`evt_…`) for at least 31 hours
