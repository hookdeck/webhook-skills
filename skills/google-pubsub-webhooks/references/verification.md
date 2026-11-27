# How to Verify Google Cloud Pub/Sub Push Requests

## There Is No Signature to Verify

Pub/Sub has **no signing secret and no HMAC header**. If you are searching for
`X-Goog-Signature`, `X-Goog-Webhook-Signature`, or Standard Webhooks headers
(`webhook-id`, `webhook-timestamp`, `webhook-signature`), stop — they do not
exist for push subscriptions. Any code claiming to HMAC a Pub/Sub payload
against a "Pub/Sub webhook secret" is fabricated.

What you can verify instead depends on how the subscription was created:

| Subscription | Header sent | Verifiable? |
|--------------|-------------|-------------|
| Default push | none | No. Only URL secrecy and network controls |
| `--push-auth-service-account` set | `Authorization: Bearer <OIDC JWT>` | Yes — Google-signed RS256 token |

## Why Signature Verification Matters Here

A push endpoint is a public URL that mutates your data. Without authentication,
anyone who learns the URL can POST a fake `message` envelope and your handler
cannot tell the difference. Configure OIDC. The unauthenticated path documented
below is a mitigation, not a verification.

## What the OIDC Token Proves (and What It Doesn't)

The token is a Google-signed OpenID Connect ID token. It proves the caller holds
your push service account's identity.

**It does not sign the request body.** This is the single biggest difference from
HMAC providers like Stripe or Shopify: there is no body-integrity guarantee, so
there is also **no raw-body requirement**. Parsing JSON before authenticating is
safe here in a way it never is for an HMAC webhook. What the token gives you is
caller authentication over TLS — the body is trusted transitively, because only
Google's Pub/Sub could have presented that token to your TLS-protected endpoint.

## Token Claims

```json
{
  "aud": "https://example.com/webhooks/google-pubsub",
  "azp": "113774264463038321964",
  "email": "pubsub-push@my-project.iam.gserviceaccount.com",
  "email_verified": true,
  "exp": 1755112392,
  "iat": 1755108792,
  "iss": "https://accounts.google.com",
  "sub": "113774264463038321964"
}
```

Check all four of these:

| Claim | Required value | Who checks it |
|-------|----------------|---------------|
| signature | RS256 against Google's public keys | The library |
| `exp` | Not in the past | The library |
| `aud` | The subscription's audience, or the push endpoint URL if no audience was set | The library, when you pass it |
| `iss` | `https://accounts.google.com` **or** `accounts.google.com` | **You** — accept both; the official libraries do |
| `email` | Your push service account's email | **You** |
| `email_verified` | `true` | **You** |

Skipping `email` is the classic mistake: without it, *any* Google-signed ID token
with the right audience is accepted, including one minted by an unrelated
project. `aud` alone is not an authorization decision.

Tokens attached to push requests may be **up to an hour old**, so do not add a
tighter freshness check of your own.

Three comparisons that must be lenient, or you reject valid deliveries:

- **`iss` has two valid forms.** Accept both `https://accounts.google.com` and
  the scheme-less `accounts.google.com`. Pinning one is a plausible-looking
  hardening that buys nothing — Google's own libraries accept either.
- **The `Bearer` scheme is case-insensitive** per RFC 9110 §11.1 (which obsoleted RFC 7235). Match it with a
  lowercased comparison, not `=== 'Bearer'`.
- **Service account emails are case-insensitive.** Normalize both sides before
  comparing, or a casing typo in your config silently rejects every message.

One thing to be careful about claiming: **JWT allows `aud` to be either a string
or an array** ([RFC 7519 §4.1.3](https://www.rfc-editor.org/rfc/rfc7519#section-4.1.3)),
and defensive implementations accept both. Google's documented Pub/Sub token
shows a single string, and nothing in the Pub/Sub docs says an array is ever
sent — so handle both if you hand-roll the check, but do not assume the array
form is something you will actually see here. The official libraries cover it
either way.

## Implementation

### Node.js — `google-auth-library` (official)

```javascript
const { OAuth2Client } = require('google-auth-library');

// Reuse one client: it caches Google's public keys in-process.
const client = new OAuth2Client();

async function verifyPushJwt(authorizationHeader) {
  // RFC 9110: the auth scheme is case-insensitive.
  const [scheme, token] = String(authorizationHeader || '').split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;

  let claims;
  try {
    // Fetches/caches Google's keys, verifies the RS256 signature, aud, and exp.
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.PUBSUB_AUDIENCE,
    });
    claims = ticket.getPayload();
  } catch (err) {
    console.error('Pub/Sub OIDC verification failed:', err.message);
    return null;
  }

  // Google's own sample accepts both issuer forms.
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) return null;
  if (String(claims.email || '').toLowerCase()
      !== process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL.trim().toLowerCase()) return null;
  if (claims.email_verified !== true) return null;
  return claims;
}
```

### Python — `google-auth` (official)

```python
import os

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

# Reuse one transport: the library caches Google's certs on it.
_request = google_requests.Request()


def verify_push_jwt(authorization_header):
    scheme, _, token = (authorization_header or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    try:
        # Verifies the RS256 signature, aud, and exp, and that iss is a Google issuer.
        claims = id_token.verify_oauth2_token(
            token, _request, audience=os.environ["PUBSUB_AUDIENCE"]
        )
    except Exception as exc:  # ValueError / GoogleAuthError
        print("Pub/Sub OIDC verification failed:", exc)
        return None

    # Google's own sample accepts both issuer forms.
    if claims.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        return None
    expected = os.environ["PUBSUB_SERVICE_ACCOUNT_EMAIL"].strip().lower()
    if str(claims.get("email") or "").lower() != expected:
        return None
    if claims.get("email_verified") is not True:
        return None
    return claims
```

### Manual verification (only if you cannot use a library)

The libraries handle key fetching, caching, key rotation, and the RS256 check.
Rolling your own is not recommended, but the mechanics are ordinary OIDC:

1. Split the JWT into `header.payload.signature`; base64url-decode the header and
   read `kid` and `alg` (`alg` must be `RS256` — reject `none` and any HMAC alg).
2. Fetch Google's public keys and look up `kid`:
   - JWKS: `https://www.googleapis.com/oauth2/v3/certs`
   - X.509 PEM: `https://www.googleapis.com/oauth2/v1/certs` (what `google-auth`
     uses for `verify_oauth2_token`)
   - Both are discoverable from `https://accounts.google.com/.well-known/openid-configuration`.
3. Verify the RS256 signature over `header.payload`.
4. Check `exp` (and `iat` sanity), `aud`, `iss`, `email`, `email_verified`.
5. **Cache the keys** and honour the endpoint's `Cache-Control: max-age`. Fetching
   JWKS on every request is a hard dependency on Google's availability in your
   request path, and a trivial way to get rate limited.

## When the Subscription Has No Authentication

Pub/Sub sends **nothing** you can check. There is no header worth reading. The
defences are:

1. **An unguessable token in the push endpoint URL**, compared server-side:

   ```javascript
   // Push endpoint: https://example.com/webhooks/google-pubsub?token=<random>
   const provided = Buffer.from(String(req.query.token || ''));
   const expected = Buffer.from(process.env.PUBSUB_VERIFICATION_TOKEN);
   const ok = provided.length === expected.length
     && crypto.timingSafeEqual(provided, expected);
   ```

   This is a **shared-secret convention, not a signature scheme** — but it is not
   something this skill invented. Google's own App Engine sample uses exactly this
   pattern under the same `PUBSUB_VERIFICATION_TOKEN` name, comparing
   `request.args.get("token")` against the configured value
   ([python-docs-samples](https://github.com/GoogleCloudPlatform/python-docs-samples/blob/main/appengine/standard_python3/pubsub/main.py),
   referenced from [Authentication for push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)).
   It still proves nothing about the body. Weaknesses worth knowing: the secret
   travels in the URL, so it lands in access logs, proxy logs, and error trackers,
   and it is replayable by anyone who reads one. It also interacts with OIDC — if
   the subscription has no explicit audience, the audience is the URL *including*
   `?token=…`.

2. **Network-level ingress restriction** — Cloud Run/Cloud Functions with
   `--no-allow-unauthenticated` and IAM, an internal load balancer, VPC Service
   Controls, or a WAF rule. This is the stronger control of the two.

Do not fabricate a signature check for this case. If your code has an
`if (signature === expected)` branch on a default Pub/Sub push request, it is
comparing values Pub/Sub never sent.

The examples in this skill **fail closed**: with neither OIDC nor a verification
token configured, they reject requests until `PUBSUB_ALLOW_UNAUTHENTICATED=true`
is set explicitly, which is what makes emulator testing possible without
silently shipping an open endpoint.

## Common Gotchas

- **`aud` mismatch is the #1 cause of 401s.** If the subscription has no
  `--push-auth-token-audience`, the audience is the full push endpoint URL
  including path and query string. A trailing slash, `http` vs `https`, or a
  tunnel URL that changed between runs all break it.
- **The token is not per-message.** The same token is reused for up to an hour
  across many pushes. Do not treat it as a nonce or de-duplicate on it.
- **Checking `aud` but not `email`** accepts tokens from any Google project.
- **The emulator sends no auth**, so anything that works locally against the
  emulator has not exercised your verification path.
- **`message.data` may be absent.** Attribute-only messages are valid; decoding
  unconditionally throws.
- **Header case.** Node lowercases headers (`req.headers.authorization`); use
  case-insensitive lookups elsewhere.
- **No raw body needed.** Unlike HMAC providers, you can use your framework's
  JSON body parser. Do not go hunting for a raw-body middleware here.
- **Non-2xx is a nack.** Returning 401 for a bad token means Pub/Sub retries it,
  which is correct behaviour for a misconfigured audience — fix the config, or
  those retries continue until the message expires.

## How to Debug Verification Failures

**Decode the token first** (it is not encrypted) and compare claims to your
config:

```bash
# Paste the token after "Bearer " from your request log
echo '<jwt>' | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

| Error | Meaning | Fix |
|-------|---------|-----|
| `Wrong recipient, payload audience != requiredAudience` | `aud` mismatch | Set `PUBSUB_AUDIENCE` to the exact subscription audience, or the exact push URL |
| `Token used too late` / `Token expired` | `exp` passed | Check server clock skew; tokens can legitimately be ~1 hour old |
| `No pem found for envelope` | `kid` not in Google's key set | Stale key cache, or the token is not from Google |
| `Invalid token signature` | Signature check failed | Token was tampered with or is not Google-issued |
| `Wrong issuer` | `iss` is not a Google issuer | Not a Google-issued token |
| Verification passes but you reject it | `email` / `email_verified` check | Confirm `PUBSUB_SERVICE_ACCOUNT_EMAIL` matches `--push-auth-service-account` |
| No `Authorization` header | Subscription has no push auth service account | Recreate/update the subscription with `--push-auth-service-account` |

Verify what the subscription is actually configured with:

```bash
gcloud pubsub subscriptions describe my-sub \
  --format='yaml(pushConfig)'
```

## References

- [Authentication for push subscriptions](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
- [Push subscriptions](https://cloud.google.com/pubsub/docs/push)
- [google-auth-library (Node.js)](https://github.com/googleapis/google-auth-library-nodejs)
- [google-auth (Python)](https://google-auth.readthedocs.io/)
