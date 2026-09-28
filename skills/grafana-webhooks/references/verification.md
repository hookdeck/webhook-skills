# How to Verify Grafana Webhook Signatures

## Why Signature Verification Matters

A Grafana webhook contact point POSTs to a URL that is, by necessity, publicly
reachable. Without verification anyone who learns the URL can fabricate an incident —
or, worse, a false all-clear. A self-hosted Grafana sends from whatever address your
instance egresses from. Grafana Cloud does publish source-IP lists (see
[overview.md](overview.md#where-requests-come-from)), but those are shared across
every Grafana Cloud customer, so an IP allowlist is defence in depth, not a
substitute for verifying the signature.

HMAC signing is **optional** in Grafana: it is off until you fill in the contact
point's HMAC **Secret**. Your receiver should still require it and fail closed.

## How It Works

Grafana's `HMACRoundTripper` (in `grafana/alerting`, `http/hmac.go`) signs each
outgoing request:

```go
hash := hmac.New(sha256.New, []byte(rt.secret))
if rt.timestampHeader != "" {
    timestamp := strconv.FormatInt(rt.clk.Now().Unix(), 10)
    req.Header.Set(rt.timestampHeader, timestamp)
    hash.Write([]byte(timestamp))
    hash.Write([]byte(":"))
}
hash.Write(body)
signature := hex.EncodeToString(hash.Sum(nil))
req.Header.Set(rt.header, signature)
```

In words:

| Property | Value |
|----------|-------|
| Algorithm | HMAC-SHA256 |
| Encoding | lowercase **hex**, bare — no `sha256=` prefix, no `t=…,v1=…` structure |
| Key | the contact point's HMAC `secret`, used **as-is** as UTF-8 bytes — not base64-decoded, no prefix, not a Grafana API key |
| Signed content (no timestamp header) | the raw body bytes |
| Signed content (timestamp header set) | `<unix-seconds>` + `":"` + raw body bytes |
| Separator | a **colon**, not a dot. Docs state it verbatim: `HMAC(timestamp + ":" + body)` |
| Signature header | user-configurable; default `X-Grafana-Alerting-Signature` |
| Timestamp header | user-configurable; **no default name**, unset means no timestamp at all |
| Timestamp unit | **seconds** (10 digits), from `time.Now().Unix()` — not milliseconds |

Both header names come from your contact point config, so **read them from
configuration** rather than hard-coding. The examples in this skill use
`GRAFANA_SIGNATURE_HEADER` (defaulting to `X-Grafana-Alerting-Signature`) and
`GRAFANA_TIMESTAMP_HEADER` (empty = body-only mode).

## Implementation

Grafana publishes **no receiver SDK** for webhook verification — every language here
is manual. The algorithm is small enough that this is fine.

### Node.js

```javascript
const crypto = require('crypto');

function verifyGrafanaSignature(rawBody, signature, timestamp, secret, {
  timestampRequired = false,
  maxAgeSeconds = 300,
} = {}) {
  // Fail closed: no secret configured, or no signature sent.
  if (!secret || !signature) return false;

  // If we're configured for timestamped signing, a request without the
  // timestamp header cannot have been signed that way — reject it.
  if (timestampRequired) {
    if (!timestamp) return false;
    const ts = Number(timestamp);                    // UNIX SECONDS
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > maxAgeSeconds) return false;
  }

  const hmac = crypto.createHmac('sha256', secret);  // secret used as-is (UTF-8)
  if (timestampRequired) hmac.update(`${timestamp}:`);  // COLON separator
  hmac.update(rawBody);                              // RAW bytes
  const expected = hmac.digest('hex');               // lowercase hex, bare

  // Guard lengths before timingSafeEqual — it THROWS on a length mismatch.
  const received = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (received.length !== want.length) return false;
  return crypto.timingSafeEqual(received, want);
}
```

### Python

```python
import hashlib
import hmac
import time


def verify_grafana_signature(
    raw_body: bytes,
    signature: str | None,
    timestamp: str | None,
    secret: str | None,
    *,
    timestamp_required: bool = False,
    max_age_seconds: int = 300,
) -> bool:
    if not secret or not signature:
        return False

    if timestamp_required:
        if not timestamp:
            return False
        try:
            ts = int(timestamp)              # UNIX SECONDS
        except (TypeError, ValueError):
            return False
        if abs(int(time.time()) - ts) > max_age_seconds:
            return False

    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    if timestamp_required:
        mac.update(f"{timestamp}:".encode("utf-8"))   # COLON separator
    mac.update(raw_body)                              # RAW bytes

    # compare_digest is constant-time and safe on differing lengths. Compare
    # bytes: given two str values it raises TypeError on any non-ASCII character.
    received = signature.strip().lower().encode("utf-8", errors="replace")
    return hmac.compare_digest(received, mac.hexdigest().encode("ascii"))
```

## Replay Protection

Replay protection is only possible when a **Timestamp Header** is configured. The docs
say to "extract the timestamp value and verify it's recent to prevent replay
attacks" — but Grafana **documents no specific tolerance**. The 300-second window in
these examples is *our* choice, not Grafana's; tune it to your own clock skew and
network latency.

Without a timestamp header there is nothing to check: a captured request stays valid
forever. If replay matters to you, configure the header.

When your verifier *is* configured for a timestamp header, reject any request that
arrives without it — such a request cannot have been signed the way you expect, and
silently falling back to body-only verification would let an attacker choose the
weaker mode.

## Common Gotchas

- **Verify the raw body.** Do not `JSON.parse` / `json.loads` and re-serialize.
  Grafana's default body is Go `json.Marshal` output (compact, no trailing newline),
  but with **Custom Payload** the body is whatever the template renders — possibly
  pretty-printed, possibly not JSON at all. Use `express.raw()`, `await
  request.text()`, or `await request.body()`.
- **Colon, not dot.** `timestamp + ":" + body`. Stripe-style `timestamp + "." + body`
  will never match.
- **Bare hex digest.** No `sha256=` prefix to strip, no `v1=` to parse. If you strip
  a prefix that isn't there you'll mangle the value.
- **Seconds, not milliseconds.** A 13-digit timestamp means you produced it, not
  Grafana.
- **Secret is used as-is.** No base64 decode, no prefix removal.
- **`timingSafeEqual` throws on unequal lengths** — guard with a length check, or wrap
  in try/catch. Python's `hmac.compare_digest` handles unequal lengths, but compare
  **bytes**, not `str` — with two strings it raises `TypeError` on any non-ASCII
  character, which a forged header can easily contain.
- **Header names are configurable.** Don't hard-code `X-Grafana-Alerting-Signature` if
  your contact point sets a custom one, and remember the timestamp header has no
  default name at all.
- **Header lookup is case-insensitive** in Express (`req.headers` is lowercased),
  `Headers.get()`, and Starlette — but lowercase your configured name before indexing
  `req.headers` directly in Express.
- **No secret means reject.** If `GRAFANA_WEBHOOK_SECRET` is unset, fail closed with a
  clear 500/401. Never silently accept unsigned requests.
- **Hex case.** Grafana emits lowercase; lowercasing the received value before
  comparing is harmless and guards against a proxy that upcases it.

## Debugging Verification Failures

| Error | Cause | Fix |
|-------|-------|-----|
| No signature header at all | HMAC Secret is empty, or Grafana < 11.6 | Fill in the HMAC **Secret**; upgrade to 11.6+ |
| Signature never matches, body-only mode | Body was re-serialized before hashing | Hash the raw bytes |
| Signature never matches, timestamped mode | Wrong separator, or timestamp read from the wrong header | Use `:`; check the header name matches the contact point |
| Signature matches in dev, fails in prod | A proxy is re-encoding or re-compressing the body | Verify before any body-transforming middleware |
| `Input buffers must have the same byte length` | `timingSafeEqual` on differing lengths | Length-guard before comparing |
| Works, then fails after a while | Timestamp tolerance too tight, or clock skew | Widen `GRAFANA_MAX_AGE_SECONDS`; sync clocks with NTP |
| Test button works, real alerts don't | Nothing to do with signing | Check that a notification policy routes to this contact point |

## Authentication Alternatives

The same contact point can add **HTTP Basic Authentication** (`Authorization: Basic
base64(user:pass)`), an **Authorization Header** (`authorization_scheme`, default
`Bearer`, plus `authorization_credentials`), or a **TLS client certificate**. Grafana
refuses a config that sets both Basic auth and the Authorization header.

These can be combined with HMAC, but only HMAC covers the payload's integrity — basic
auth and bearer tokens only authenticate the sender, and a static credential replayed
with a modified body would pass. If you check one, compare it in constant time too.
