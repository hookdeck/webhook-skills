# How to Verify Green Dot Webhooks

## Why This Is Different

Green Dot Embedded Finance does **not** use the Standard Webhooks spec and does
**not** rely on a mandatory HMAC signature. It uses **push authentication**:
Green Dot proves its identity to your endpoint with an OAuth
**client_credentials Bearer token** on every request (or, in the Certificate
variant, a client certificate at the TLS layer).

So "verification" here is a single application-level check:

- **Authenticate the delivery** — validate the OAuth Bearer token and require
  the `post:webhook` scope. (Primary, always present.)

A delivery may also carry an `x-gd-signature` header, but its algorithm is
**not documented publicly**, so this skill does not verify it (see section 2).

Only parse the JSON body **after** the token check passes.

## 1. OAuth Bearer Token (primary)

Green Dot sends `Authorization: Bearer <token>`. The token is issued by the
client_credentials grant with scope `post:webhook`.

**In production**, validate it against your authorization server:

- If it is a **JWT** (RS256), verify the signature against the issuer's JWKS and
  check `iss`, `aud`, `exp`, and that `scope` contains `post:webhook`.
- If it is **opaque**, call the authorization server's token introspection
  endpoint and check the returned scope.

For a **self-contained, testable** example, the code in this skill validates an
**HS256** JWT signed with a shared secret (`GREENDOT_WEBHOOK_TOKEN_SECRET`) and
requires the `post:webhook` scope. Swap in JWKS/RS256 or introspection for your
real authorization server.

```javascript
const jwt = require('jsonwebtoken');

function verifyToken(authHeader) {
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Missing bearer token');
  const claims = jwt.verify(token, process.env.GREENDOT_WEBHOOK_TOKEN_SECRET); // HS256
  const scopes = String(claims.scope || claims.scp || '').split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes(process.env.GREENDOT_WEBHOOK_SCOPE || 'post:webhook')) {
    throw new Error('Token missing required scope');
  }
  return claims;
}
```

```python
import os, jwt  # PyJWT

def verify_token(auth_header: str) -> dict:
    token = (auth_header or "").removeprefix("Bearer ").strip()
    if not token:
        raise ValueError("Missing bearer token")
    claims = jwt.decode(token, os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"], algorithms=["HS256"])
    scopes = str(claims.get("scope") or claims.get("scp") or "").replace(",", " ").split()
    if os.environ.get("GREENDOT_WEBHOOK_SCOPE", "post:webhook") not in scopes:
        raise ValueError("Token missing required scope")
    return claims
```

If you use the **Certificate** (mTLS) variant instead of OAuth, the token check
is replaced by client-certificate validation at your TLS terminator / reverse
proxy — there is no application-level token to check.

## 2. The x-gd-signature header is NOT verified here

A delivery *may* include an `x-gd-signature` header. **This skill does not
verify it, on purpose.**

> ⚠️ Green Dot's public docs do **not** document the `x-gd-signature`
> algorithm, its encoding, or the canonical payload it is computed over. There
> is no published HMAC-SHA256 scheme to reproduce. Shipping a *guessed* HMAC
> would be worse than nothing: a wired-in key would make an unverified payload
> *look* verified.

If you require payload-level verification:

1. Obtain the exact algorithm, encoding, and canonical-payload definition (and
   the signing key) from your **Green Dot representative**.
2. Implement the check over the **raw** request body (never the re-serialized
   parsed object) with a **timing-safe** comparison, *after* the token check.

Until you have that specification, rely on the OAuth Bearer token (and/or the
Certificate/mTLS transport) for authenticity — that is Green Dot's documented
inbound-auth model.

## 2b. The `API-Key` header is informational, not a signature

Green Dot's docs also list an `API-Key` header sent on every delivery, carrying
**your program's own, static API key**. Do not mistake this for a signature: it
is not computed from the payload and does not rotate per request — it is the
same value you already hold. If you choose to compare it, treat it as weak
defense-in-depth layered on top of the OAuth Bearer token check (§1), never as
a replacement for it.

## 3. Acknowledge Correctly

After the token check passes and you have handled the event, respond `200`/`201`
and:

- **Echo the `x-GD-RequestId` header** back on your response.
- Return a `responseDetails` body:

```json
{ "responseDetails": [{ "code": 0, "subCode": 0, "description": "<x-GD-RequestId>" }] }
```

## Common Gotchas

- **Token check is the real gate.** Authenticity comes from the OAuth Bearer
  token (or the Certificate/mTLS transport), not from a payload signature.
- **Do not invent an `x-gd-signature` HMAC.** Its algorithm is undocumented; a
  guessed check gives false confidence. Get the spec from your rep first.
- **Don't treat `API-Key` as a signature.** It's your program's API key, the
  same on every delivery — not proof the payload wasn't tampered with.
- **Always echo `x-GD-RequestId`.** Green Dot's docs require it, with a `200`/`201`
  and a `responseDetails` JSON body, on every response. Retries are triggered by
  `5xx`, timeouts, `401`/`403` and connection failures.
- **Timing-safe compare**, and guard against unequal lengths (Node's
  `timingSafeEqual` throws on length mismatch).
- **HTTPS only.** Bearer tokens are secrets in transit; never accept webhooks
  over plain HTTP.
- **Idempotency.** Retries can redeliver the same event for up to 24 hours —
  dedupe on each event's `eventIdentifier`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong `GREENDOT_WEBHOOK_TOKEN_SECRET`, expired token, or missing `post:webhook` scope |
| `jwt malformed` / decode error | `Authorization` header not `Bearer <jwt>`, or token is opaque (use introspection instead) |
| Green Dot keeps retrying | Your endpoint returned a `5xx`, `401` or `403`, or timed out |
