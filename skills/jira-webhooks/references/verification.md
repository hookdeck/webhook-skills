# Jira Signature Verification

## How It Works

Jira Cloud has two families of webhooks, and they are secured differently. Pick
the verification path that matches how the webhook was registered.

| How the webhook was registered | Security | Header |
|---|---|---|
| **Admin webhook** — Jira admin **WebHooks** page, or `POST /rest/webhooks/1.0/webhook` — with a `secret` | HMAC-SHA256 over the raw body | `X-Hub-Signature: sha256=<hex>` |
| Admin webhook **without** a `secret` | Unsigned | — |
| **Connect app** — webhook module in the app descriptor | Atlassian Connect JWT signed with the app's `sharedSecret` | `Authorization` |
| **OAuth 2.0 (3LO) app** — dynamic webhook via `POST /rest/api/3/webhook` | Bearer JWT signed with the app's client secret | `Authorization` |
| **Connect app** — dynamic webhook via `POST /rest/api/3/webhook` | Not stated in the webhooks docs | — |

The docs describe `X-Hub-Signature` only under **Secure admin webhooks**. The
"REST API" that section refers to links to the admin endpoint
(`/rest/webhooks/1.0/webhook`), not to `/rest/api/3/webhook`. That endpoint's
request body has no `secret` field at all (see the
[webhooks REST reference](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/)).

This skill's examples implement the **admin-webhook** path.

### Admin webhooks (`X-Hub-Signature`)

Admin webhooks accept an optional `secret` — set it when creating or editing the
webhook on the WebHooks page (the **Generate secret** button makes one for you),
or pass `"secret"` in the `/rest/webhooks/1.0/webhook` request body. When a secret is set, Jira computes an
HMAC over the **raw request body** keyed with that secret and sends it in the
`X-Hub-Signature` header, formatted per
[WebSub](https://www.w3.org/TR/websub/#signing-content) as `method=signature`:

```
X-Hub-Signature: sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9
```

- **Algorithm:** HMAC-SHA256 (the `method` part of the header)
- **Encoding:** lowercase hex, prefixed with `sha256=`
- **Signed content:** the exact raw bytes of the request body (UTF-8)
- **Key:** the webhook's `secret`. It can't be viewed again after saving.

To verify, recompute the HMAC over the raw body with your secret and compare it
(timing-safe) against the hex portion of the header.

Admin webhooks registered **without** a secret are not signed. In the REST
response, `isSigned` is `true` only when a secret is defined.

**Official test vector** (from Atlassian's
[Secure admin webhooks](https://developer.atlassian.com/cloud/jira/platform/webhooks/#secure-admin-webhooks)
docs; Bitbucket uses the same one):

| Input | Value |
|---|---|
| secret | `It's a Secret to Everybody` |
| payload | `Hello World!` |
| method | `sha256` |
| `X-Hub-Signature` | `sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9` |

The example test suites assert this vector.

### App webhooks (`Authorization` JWT)

For webhooks that belong to an app, the docs describe a JWT rather than
`X-Hub-Signature`:

- **Connect apps** (webhooks declared in the app descriptor): the webhooks page
  says these are "signed with your app's sharedSecret". Connect apps receive
  that JWT in the `Authorization` header. The
  [Connect JWT guide](https://developer.atlassian.com/cloud/jira/platform/understanding-jwt-for-connect-apps/)
  covers verifying it: HS256 with the `sharedSecret`, plus a `qsh`
  (query-string hash) check for server-to-server JWTs. The webhooks page
  doesn't restate those details for webhooks specifically. Atlassian is ending
  Connect support in favour of Forge.
- **OAuth 2.0 (3LO) apps** (dynamic webhooks registered with
  `POST /rest/api/3/webhook`): "secured by bearer authentication. The token is
  present in the `Authorization` header and is signed with the app's client
  secret." Verify it with a standard JWT library.

**Forge apps** don't use either scheme. Forge delivers Jira events to Forge
functions, or, with
[Forge Remote](https://developer.atlassian.com/platform/forge/remote/sending-product-events/),
to a remote endpoint declared in the app manifest, with a Forge Invocation
Token you verify as described in Atlassian's *Verifying remote requests*
guide.

## Implementation

Jira Cloud does not ship a first-party SDK method for webhook verification, so
verify manually with your language's standard crypto library. The algorithm is
identical across frameworks.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyJiraWebhook(rawBody, signatureHeader, secret) {
  const [method, sig] = (signatureHeader || '').split('=');
  if (method !== 'sha256' || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_jira_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    method, _, sig = (signature_header or "").partition("=")
    if method != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing parsed JSON changes byte
  order and whitespace, breaking the HMAC. Read the raw body first, verify, then
  parse. In Express use `express.raw({ type: 'application/json' })`; in Next.js
  use `await request.text()`; in FastAPI use `await request.body()`.
- **The header is `X-Hub-Signature`, not `X-Hub-Signature-256`.** Jira reuses the
  GitHub-style header name but *without* the `-256` suffix, even though the
  algorithm is SHA-256. HTTP header names are case-insensitive.
- **Strip the `sha256=` method prefix** before comparing. The header value is
  `sha256=<hex>`, not a bare hex string.
- **There is no event-type header.** Dispatch on the `webhookEvent` field in the
  JSON body, not a header.
- **No secret, no signature.** If `X-Hub-Signature` is absent, the admin webhook
  was saved without a `secret` (or it is an app webhook, which uses an
  `Authorization` JWT instead). Add a secret to the webhook rather than
  accepting unsigned deliveries.
- **Imported webhooks may stop delivering.** Admin webhooks with a secret that
  were imported from another site or instance may not be delivered until you
  rotate the secret.
- **The method may change.** Jira notes it "might start using another method for
  the HMAC in the future". The examples reject any method other than `sha256`,
  so they fail closed rather than silently accepting an unverified delivery.
- **Compare timing-safe.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  and guard against buffer length mismatches.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Always fails | Verifying re-serialized JSON instead of the raw body |
| Header is `undefined`/`None` | Admin webhook has no `secret` set, it's an app (Connect/OAuth) webhook that uses an `Authorization` JWT, or you're reading `x-hub-signature-256` instead of `x-hub-signature` |
| Suddenly fails after a site import | Imported admin webhook with a secret — rotate the secret |
| `timingSafeEqual` throws | Malformed hex in the header — catch and return `false` |
| Works locally, fails in prod | A proxy/body parser mutated the body before your handler read it |
