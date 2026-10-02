# How to Verify Sentry Webhook Signatures

## How It Works

Sentry signs every Integration Platform delivery with **HMAC-SHA256**, encodes
the digest as **lowercase hex**, computes it over the **raw request body bytes**
and keys it with the integration's **Client Secret** used as raw UTF-8.

The authoritative source is Sentry's own server code, not just the docs —
`SentryApp.build_signature` in
`src/sentry/sentry_apps/models/sentry_app.py`:

```python
def build_signature(self, body) -> str:
    secret = self.application.client_secret
    return hmac.new(
        key=secret.encode("utf-8"), msg=body.encode("utf-8"), digestmod=sha256
    ).hexdigest()
```

and `src/sentry/sentry_apps/api/serializers/app_platform_event.py`, which builds
the body **once** and signs that exact string:

```python
@property
def body(self) -> str:
    ...
    return json.dumps(body)

@cached_property
def sentry_headers(self) -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Request-ID": uuid4().hex,
        "Sentry-Hook-Resource": self.resource,
        "Sentry-Hook-Timestamp": str(int(time())),
        "Sentry-Hook-Signature": self.install.sentry_app.build_signature(self.body),
    }
```

## The Scheme, Byte by Byte

| | |
|---|---|
| Algorithm | **HMAC-SHA256** |
| Encoding | **lowercase hex** (`.hexdigest()`) — **not base64** |
| Signed content | the **raw request body bytes**, nothing else |
| Key | the integration's **Client Secret**, raw UTF-8, used as-is |
| Primary header | `Sentry-Hook-Signature` |
| Fallback header | `Sentry-App-Signature` (UI-component requests) |
| Header value | a **bare 64-character hex digest** |

**No prefix, no `v1=`, no `t=`, no comma-separated list, exactly one
signature.** The header value is just the digest.

**The timestamp is not part of the signed string.** Do not concatenate it. Do
not implement a signature over `timestamp + "." + body` — that is Stripe's
scheme, not Sentry's.

## Implementation

There is **no SDK path**. The `@sentry/*` packages are error-reporting SDKs;
none of them, and no official Sentry client library in any language, ships a
webhook-signature verification helper. Manual HMAC is the only option, and the
only correct one.

### Node.js

```javascript
const crypto = require('crypto');

function verifySentrySignature(rawBody, headers, clientSecret) {
  if (!clientSecret) return false;                       // fail closed
  // Sentry-Hook-Signature on subscribed webhooks; Sentry-App-Signature on
  // UI-component external requests. Both are the same digest.
  const received = headers['sentry-hook-signature'] || headers['sentry-app-signature'];
  if (!received) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody ?? '', 'utf8');
  const expected = crypto
    .createHmac('sha256', clientSecret) // Client Secret AS-IS, never decoded
    .update(body)                       // RAW bytes — never re-serialized JSON
    .digest('hex');                     // lowercase hex, NOT base64

  const a = Buffer.from(String(received).trim(), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length FIRST — timingSafeEqual THROWS on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib
import hmac

def verify_sentry_signature(raw_body: bytes, headers, client_secret: str | None) -> bool:
    if not client_secret:
        return False                                      # fail closed
    received = headers.get("sentry-hook-signature") or headers.get("sentry-app-signature")
    if not received:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),                     # key AS-IS
        raw_body,                                          # RAW bytes
        hashlib.sha256,
    ).hexdigest()                                          # lowercase hex

    # compare_digest is constant-time and tolerates unequal lengths, but it
    # raises TypeError on str arguments containing non-ASCII — and Starlette
    # decodes headers as latin-1. Encode both sides.
    return hmac.compare_digest(received.strip().encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

### Sentry's published snippets are subtly wrong

The documented JavaScript snippet is:

```javascript
hmac.update(JSON.stringify(request.body), "utf8");   // ← re-serializes
```

and the Python one:

```python
body = json.dumps(request.body)                       # ← re-serializes
```

Both reconstruct a byte string from a **parsed** body. The Python one fails on
**every** payload: `json.dumps` defaults to `", "` / `": "` separators, while
Sentry signs compact JSON. The JS one coincides with Sentry's bytes **only for
ASCII-only payloads**:

- Sentry serializes with simplejson configured `separators=(",", ":")` — compact,
  which *does* match `JSON.stringify` (see `_default_encoder` in
  `src/sentry/utils/json.py`).
- But that encoder leaves simplejson's **`ensure_ascii=True`** default in place.
  Sentry therefore emits `\uXXXX` escapes for every non-ASCII character, while
  `JSON.stringify` emits the literal UTF-8 character.

So an issue title, a comment, or a username containing an accent or an emoji
produces a **different byte string**, and the JS snippet **rejects a
perfectly valid delivery**. Float and large-integer formatting can diverge too.

This is a latent bug in the published snippets, not a subtlety you can ignore.
**Verify against the raw body in every framework:**

| Framework | Raw body |
|---|---|
| Express | `express.raw({ type: '*/*' })` → `req.body` is a `Buffer` |
| Next.js App Router | `await request.text()` |
| FastAPI / Starlette | `await request.body()` |
| Flask | `request.get_data()` |

### Accept `Sentry-App-Signature` too

Sentry's **UI-component external requests** — `select_options.requested`,
`external_issue.created`, `external_issue.linked`,
`alert_rule_action.requested` — sign with the same `build_signature` but send
the header as **`Sentry-App-Signature`** (see
`src/sentry/sentry_apps/external_requests/select_requester.py`,
`issue_link_requester.py`, `alert_rule_action_requester.py`).

Sentry's own reference app checks both names on a single endpoint, commented
verbatim: *"HACK: The signature header may be one of these two values"*.

Try `sentry-hook-signature`, fall back to `sentry-app-signature`, and compare
whichever you got in constant time. This is load-bearing and easy to mistake
for a fabrication — it is real.

### Empty-body deliveries are real

Some Sentry requests arrive with an **empty body** (`b''`) and
`Content-Type: application/json`. The signature is then the HMAC of the **empty
string** — `select_options.requested` calls `build_signature("")` outright.

Two traps follow:

1. **A JSON body parser must not 400 on the empty body.** Sentry's reference app
   notes that *"Flask will throw a 400 Bad Request … because Sentry sends an
   empty body"*.
2. **`express.json()` turns an empty body into `{}`**, and signing `"{}"`
   fails. Sentry's own TypeScript example special-cases it:
   `stringifiedBody === '{}' ? '' : stringifiedBody`.

Reading the raw body sidesteps both — another reason raw-body is the rule, not a
preference.

### No replay protection is cryptographically possible

`Sentry-Hook-Timestamp` is **not signed**. An attacker who captures a valid
body and its signature can replay it with any timestamp they like, forever.

A tolerance check on the header is still worth having as a **cheap replay
dampener** — it costs nothing and raises the bar on naive replays — but be
clear with yourself about what it is:

```javascript
// Replay DAMPENER, not a cryptographic check. The timestamp is NOT signed, so
// an attacker can forge it freely. Real protection is dedupe on Request-ID.
const ts = Number(headers['sentry-hook-timestamp']);
const toleranceSeconds = Number(process.env.SENTRY_WEBHOOK_TOLERANCE_SECONDS);
if (toleranceSeconds > 0 && Number.isFinite(ts)) {
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }
}
```

**Sentry does not have Stripe-style signed-timestamp replay protection.** Do
not describe it as if it does. Dedupe on the **`Request-ID`** header — that is
the real protection, and the body has no delivery id of its own.

Note the units: `Sentry-Hook-Timestamp` is **UNIX seconds**
(`str(int(time()))`), not milliseconds.

### The key is the Client Secret, nothing else

Use the value from **Settings → Developer Settings → *your integration* →
Client Secret**, exactly as displayed, as raw UTF-8 bytes. No base64 decode, no
hex decode, no prefix stripping.

It is **not** the Client ID, **not** an auth/API token (`sntrys_…`), and **not**
a DSN. Internal integrations show a token on the same settings page — that
token is for calling Sentry's API, not for verifying webhooks.

### `timingSafeEqual` throws on length mismatch

Node's `crypto.timingSafeEqual` raises if the two buffers differ in length.
Guard lengths first (as above) or wrap in `try`/`catch`. An uncaught throw
becomes a 500 — and because repeated failures trip Sentry's circuit breaker,
500s can get your webhook **disabled**, not retried.

Python's `hmac.compare_digest` tolerates unequal lengths but raises `TypeError`
on `str` arguments containing non-ASCII characters. Starlette decodes headers as
latin-1, so a junk signature byte would turn a clean 401 into an unhandled 500.
Encode both sides to bytes.

### No source-IP allowlist

Sentry publishes **no egress IP list** for webhook delivery. Do not invent one,
and do not repurpose the inbound *ingest* IPs Sentry documents for its own
relays — those are for traffic going **to** Sentry and are not a webhook-sender
allowlist. The HMAC is the credential.

## Debugging Verification Failures

| Symptom | Cause |
|---|---|
| Works on most deliveries, fails on some | **Re-serializing the body.** A non-ASCII character (accent, emoji) in a title, comment or username. Switch to the raw body. |
| Every delivery fails, digest length is right | Wrong key — you used the Client **ID**, an auth token, or a DSN instead of the Client **Secret**. |
| Every delivery fails, digests look unrelated | You base64- or hex-**decoded** the Client Secret. Use it as-is. |
| Comparing a 44-char value against a 64-char one | You used `digest('base64')`. Sentry is **hex**. |
| Signature header is missing entirely | It is a UI-component request — check `Sentry-App-Signature` too. |
| Handler 400s before verification runs | Empty body hitting a JSON parser. Read the raw body; don't let a parser gate the route. |
| `express.json()` in use and everything fails | The raw body is gone, and `{}` is being signed instead of `''`. Use `express.raw()`. |
| Verification passes but your handler never fires | You switched on a body field. **The resource is in the `Sentry-Hook-Resource` header**; the body only has `action`. |
| `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` in logs | Missing length guard before `timingSafeEqual`. |
| Deliveries stopped arriving altogether | Repeated failures tripped the circuit breaker and Sentry **disabled the webhook**. Check the integration owner's email and the Dashboard, fix the handler, re-enable. |

### Reproduce a digest by hand

```bash
# Capture the EXACT raw body to a file first (the Hookdeck CLI web UI shows it).
# Redirect the file directly -- "$(cat body.json)" would strip trailing newlines.
openssl dgst -sha256 -hmac "$SENTRY_CLIENT_SECRET" -hex < body.json
```

Compare the output with the `Sentry-Hook-Signature` header. If they differ, the
bytes you captured are not the bytes Sentry signed — which is almost always a
re-serialization problem, not a key problem.

## References

- [Webhooks](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/)
- [Sentry Hook Signature](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/#sentry-hook-signature)
