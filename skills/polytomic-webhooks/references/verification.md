# Polytomic Webhook Verification

## How It Works: There Is No Signature

**Polytomic does not sign its webhook payloads.** There is no HMAC, no digest, no
signature header and no signing secret.

The **only** authentication is a **static shared bearer token**. Verbatim from the
docs, under the `Authorization` header heading:

> *"This should be a 'Bearer' token matching the same value that was provided as
> the 'Secret' during connection setup. For now, this is the only request
> authorization and is a static value."*

So the whole verification task is: **compare the incoming `Authorization` header
against the stored connection Secret, in constant time.**

### What NOT to write

- **No `crypto.createHmac` / `crypto.createHash` / `hmac.new` / `hashlib.*`
  anywhere in the verify path.** There is nothing to HMAC — no signature header
  exists to compare a digest against.
- **Do not invent a signature header.** The documented header list (below) is
  complete. There is no `X-Polytomic-Signature`, no `X-Polytomic-*` header of any
  kind, and Polytomic does not follow the Standard Webhooks spec (`webhook-id` /
  `webhook-timestamp` / `webhook-signature`).
- **Do not HMAC the timestamp plus the body "because the timestamp header is
  there."** See the next section.

## The Trap: `Polytomic-Signature-Timestamp` Is Not a Signature

Despite the word "Signature" in its name, this header carries **only a timestamp**.

- Format: **RFC 3339 / ISO 8601 UTC**. Documented example: `2021-06-01T22:55:36Z`.
- It is **not** a Unix epoch integer. `parseInt("2021-06-01T22:55:36Z")` yields
  `2021` — a silent, catastrophic bug.
- It is **not** a digest of anything.

The docs say:

> *"This signature lets your backend know when the request was created. In the
> future it may be used in combination with message signing to provide security.
> In general, it is a good idea to reject requests older than you expect (more
> than a few minutes old)."*

So parse it with `new Date(value)` (Node) or `datetime.fromisoformat` (Python —
handle the trailing `Z`; see the gotcha below), and use it for a **freshness
check only**.

### A freshness window is legitimate — and proves nothing about authenticity

Implementing the staleness check is doc-endorsed **defence-in-depth**, and the
examples here do it as an **optional, configurable tolerance defaulting to 300
seconds** (the docs' "more than a few minutes old").

Be explicit with readers about its limits:

> **The timestamp is not covered by any signature.** An attacker who has the
> bearer token can set any timestamp they like. The window defends against replay
> of an *old captured request* — nothing more. It is not a substitute for, or an
> upgrade to, the bearer check.

## Documented Headers (Complete List)

In the docs' own casing:

| Header | Documented value | Role |
|--------|------------------|------|
| `Authorization` | `Bearer <secret>` | **The only authentication.** |
| `Polytomic-Signature-Timestamp` | `2021-06-01T22:55:36Z` | RFC 3339 UTC timestamp. Freshness only. |
| `Content-Type` | `application/json` | *"Polytomic delivers its webhooks payloads as json only. This header will always be present."* |
| `User-Agent` | `Polytomic/rel2021.05.25` | Illustrative only — the release suffix changes. **Never authenticate on it.** |
| `Content-Length` | e.g. `646` | Ordinary. |

### The gzip ambiguity (the one inconsistent claim on the page)

The docs' sample request shows an `Accept-Encoding: gzip` line, while the prose
says *"Polytomic delivers payloads as a gzipped response to minimize bandwidth
use. Your client likely supports decoding this automatically."*

Those are in tension: `Accept-Encoding` on a **request** is a request header, so
it is not what would carry response-body compression. Rather than assert a header
we have not observed, take the operational consequence:

- **The body may arrive gzip-compressed.**
- Most frameworks and reverse proxies **decompress it transparently** — so
  `express.json()`, Next.js `request.json()` and FastAPI `await request.json()`
  generally just work.
- **If you capture the raw body yourself**, you may need to inflate it. (Note that
  with no signature there is no raw-body *requirement* here — unlike every
  HMAC-signed provider, you are free to let the framework parse the JSON.)

Treat this as **unsettled** until you capture a real delivery. Polytomic's sync
history view (Advanced settings → *Capture webhook requests and responses*,
default on) is the place to look.

## Implementation

There is **no Polytomic SDK webhook verifier** — no SDK helper exists for this,
because there is no signature scheme to wrap. Manual comparison is the
implementation for every framework and language.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBearerToken(authorizationHeader, secret) {
  if (!secret) return null;                      // unset => caller MUST fail closed (500)
  if (typeof authorizationHeader !== 'string') return false;

  // Strip exactly ONE leading "Bearer " prefix. The scheme is case-insensitive
  // per RFC 7235; the token after it is not.
  const token = authorizationHeader.replace(/^Bearer /i, '');

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // Length-guard first: crypto.timingSafeEqual throws on unequal buffer lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac

def verify_bearer_token(authorization_header: str | None, secret: str | None) -> bool | None:
    if not secret:
        return None          # unset => caller MUST fail closed (500)
    if not authorization_header:
        return False

    # Strip exactly ONE leading "Bearer " prefix, case-insensitively on the scheme.
    token = authorization_header
    if token[:7].lower() == "bearer ":
        token = token[7:]

    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the header is attacker-supplied.
    return hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8"))
```

`hmac.compare_digest` is used here purely as Python's constant-time byte
comparison. **No HMAC is computed** — there is no `hmac.new(...)` call anywhere.

### Timestamp freshness (optional)

```javascript
// Returns true when within tolerance. toleranceSeconds <= 0 disables the check.
function timestampIsFresh(header, toleranceSeconds = 300) {
  if (toleranceSeconds <= 0) return true;
  if (typeof header !== 'string') return false;
  // RFC 3339 UTC, e.g. "2021-06-01T22:55:36Z". NEVER parseInt() this.
  const sent = new Date(header);
  if (Number.isNaN(sent.getTime())) return false;
  return Math.abs(Date.now() - sent.getTime()) <= toleranceSeconds * 1000;
}
```

```python
from datetime import datetime, timezone

def timestamp_is_fresh(header: str | None, tolerance_seconds: int = 300) -> bool:
    if tolerance_seconds <= 0:
        return True
    if not header:
        return False
    try:
        # RFC 3339 UTC, e.g. "2021-06-01T22:55:36Z". NEVER int() this.
        # fromisoformat() only accepts a literal "Z" on Python 3.11+, so
        # normalise it to "+00:00" for 3.9/3.10 compatibility.
        sent = datetime.fromisoformat(header.strip().replace("Z", "+00:00"))
    except ValueError:
        return False
    if sent.tzinfo is None:
        sent = sent.replace(tzinfo=timezone.utc)
    delta = abs((datetime.now(timezone.utc) - sent).total_seconds())
    return delta <= tolerance_seconds
```

## Fail Closed on a Missing Secret

> **If `POLYTOMIC_WEBHOOK_SECRET` is unset, return 500 and log loudly. Never
> silently accept.**

This matters more here than on a signed provider. On a no-signature provider the
bearer token *is* the entire security boundary — treating "unconfigured" as
"accept everything" leaves a fully open endpoint that looks secure. The examples
model this by returning `null` from the verifier when the secret is unset, which
the route turns into a 500.

Status codes used by the examples:

| Condition | Status |
|-----------|--------|
| Secret not configured | `500` (fail closed) |
| Missing or mismatched `Authorization` | `401` |
| Stale/unparseable `Polytomic-Signature-Timestamp` (when tolerance > 0) | `400` |
| Malformed JSON or malformed envelope | `400` |
| Unknown `event` value | `200` (ignored — the docs anticipate future types) |
| Accepted | `200` |

Note the cost of each 4xx: *"Any 4xx or 5xx error will cause the sync to appear as
a failure."* Rejections are intentionally visible in Polytomic's sync history —
that is a feature, not a problem. But it is also why **unknown events must return
200**.

## Do NOT Verify the Token as a JWT

The documented sample `Authorization` value decodes to a real HS256 JWT with
claims:

```json
{
  "aud": "webhook",
  "jti": "00000000-0000-0000-0000-000000000000",
  "iss": "https://app.polytomic-local.com:8443/"
}
```

(`iss` is the issuing Polytomic instance; the docs' example is a local dev host,
hence `polytomic-local`.) It is worth mentioning in your own docs so readers
aren't surprised the secret *looks* structured — but hedge it as **"observed in
the documented example"**, since the docs never describe the token's internal
format.

**Treat the whole bearer string as an opaque secret and compare it
byte-for-byte**, because:

- It is signed with a key **Polytomic does not give you**, so `jwt.verify()`
  cannot succeed.
- It carries **no `exp`**, so there is no expiry to check.
- The docs call it **"a static value"** — it is a long-lived shared credential,
  not a rotating assertion.

A verifier that calls `jwt.verify` / `jwt.decode`, checks `exp`, or validates
`aud` / `iss` will either crash or add a false sense of security. Your own
workspace's real secret may not even be a JWT.

## Common Gotchas

- **Writing an HMAC verifier.** The most common failure mode. There is no
  signature to verify — the header named `...-Signature-Timestamp` is a timestamp.
- **`parseInt` / `int()` on the timestamp.** It is RFC 3339, not epoch seconds.
  `parseInt("2021-06-01T22:55:36Z")` returns `2021`, which looks like a valid
  number and silently breaks every freshness check.
- **`datetime.fromisoformat` and the trailing `Z`.** Only accepted natively on
  Python 3.11+. Replace `Z` with `+00:00` for 3.9/3.10.
- **`crypto.timingSafeEqual` throwing.** It raises on unequal buffer lengths, and
  the attacker controls the incoming length. **Length-guard first.**
- **Case-sensitivity of the scheme.** Strip `Bearer ` case-insensitively (RFC
  7235), but compare the token case-**sensitively**.
- **Stripping more than one prefix.** Use a single anchored replacement, not a
  loop or a global regex — a token could legitimately start with `Bearer`.
- **Header-name casing.** Node and FastAPI lower-case incoming header names;
  read `authorization` and `polytomic-signature-timestamp` via your framework's
  case-insensitive accessor rather than matching the docs' casing literally.
- **Assuming one record.** `object.records` is a batch (default 100,
  configurable). Loop.
- **Typing `fields` as a fixed shape.** Its keys come from the user's sync
  configuration. `email` / `last_login` are that customer's choices.
- **Assuming `metadata` is an object.** Its default is `null`; it may also be
  absent.
- **Erroring on an unknown `event`.** Return 200 — the docs anticipate new types,
  and a 4xx marks the sync failed.
- **Treating `records[].hash` as a credential.** It is a content digest for
  deduplication, computed over data Polytomic is sending you. It authenticates
  nothing.
- **Relying on the IP allowlist as authentication.** It is a firewall
  convenience, it is documented for a different purpose (database/warehouse
  connections), and it does not apply to self-hosted Polytomic.

## Debugging Verification Failures

**Everything 401s.**

1. Confirm `POLYTOMIC_WEBHOOK_SECRET` exactly matches the connection Secret —
   hover the secret key field in Polytomic to reveal it. Watch for a trailing
   newline from `echo` into `.env`, or shell-mangled characters.
2. Check you are stripping exactly one `Bearer ` prefix and not comparing the
   whole header against the bare secret.
3. Open the sync history view (*Capture webhook requests and responses*, default
   on) and read the exact `Authorization` value Polytomic sent.

**Everything 500s.** The secret is unset in that environment — that is the
fail-closed path working as designed. Check your deployment's env config.

**Everything 400s with a timestamp error.** Either your server clock has drifted,
or something is parsing the RFC 3339 value as an integer. Set
`POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS=0` to isolate the freshness check, then
fix the parse.

**Nothing arrives at all.** There is no handshake, so a wrong URL fails silently
until the sync runs. Check the sync actually ran, check the sync history, and if
you are behind a firewall see the IP notes in [setup.md](setup.md).

**The first delivery was enormous.** That is the first-run backfill, not a bug.
See *Skip backfill on first sync* in [setup.md](setup.md).

## Source

All quoted text above is from
[Webhooks — Destination](https://docs.polytomic.com/docs/webhooks-connections)
(also available as
[markdown](https://docs.polytomic.com/docs/webhooks-connections.md)), which is
Polytomic's only webhook documentation page.
