# How to Verify LiveKit Webhook Signatures

## How It Works

LiveKit's docs: "To ensure webhook requests are coming from LiveKit, these requests have an
`Authorization` header containing a signed JWT token. The token includes a sha256 hash of
the payload."

It is **not** an HMAC digest in an `X-...-Signature` header, and not Standard Webhooks.

| Part | Value |
|------|-------|
| Header | `Authorization` |
| Header value | The **bare JWT**. LiveKit's sender does `r.Header.Set("Authorization", token)`; no `Bearer ` prefix. Strip an optional case-insensitive `Bearer ` on read (proxies add it), but don't expect one |
| JWT algorithm | **HS256**, key = the project **API secret** as raw UTF-8 bytes |
| `iss` | Must equal the **API key** |
| `exp` | Must be **present** and unexpired. Tokens are minted with a 5-minute lifetime; `nbf` is issue time |
| Clock tolerance | 10 seconds (the Node SDK default; Hookdeck uses the same) |
| `sha256` claim | **base64**(SHA-256(raw body bytes)), standard base64 **with padding**, not base64url, not hex |
| Content-Type | `application/webhook+json` |

The sender, in Go (livekit/protocol `webhook/url_notifier.go`):

```go
encoded, err := protojson.Marshal(event)
sum := sha256.Sum256(encoded)
b64 := base64.StdEncoding.EncodeToString(sum[:])
at := auth.NewAccessToken(params.APIKey, params.APISecret).
    SetValidFor(5 * time.Minute).
    SetSha256(b64)
```

### Why both steps are mandatory

The JWT signature covers only the token's claims. The body is tied to the request solely
through the `sha256` claim. Checking only the JWT would accept any body sent with a
captured token; checking only the hash proves nothing. Verify the JWT, **then** compare
the body hash.

### Pin the algorithm and require `exp`

- Pass `algorithms: ['HS256']` (jose) / `algorithms=["HS256"]` (PyJWT). Accepting `none` or
  an asymmetric algorithm opens an algorithm-confusion hole. The vendor SDKs all pin it.
- Require `exp`. Both official SDKs do, with the comment: "First-party minters always set
  exp. Without this, a hand-rolled token with a valid signature and no exp verifies
  forever (livekit/protocol#1706)."
- Require `iss` to equal your API key.

## Implementation

### Manual verification (the examples)

The examples verify manually so the crypto is visible.

**Node.js (jose):**

```javascript
import crypto from 'node:crypto';
import { jwtVerify } from 'jose';

async function verifyLiveKitWebhook(rawBody, authHeader, apiKey, apiSecret) {
  if (!authHeader) throw new Error('authorization header is empty');
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const { payload } = await jwtVerify(token, new TextEncoder().encode(apiSecret), {
    algorithms: ['HS256'], issuer: apiKey, requiredClaims: ['exp'], clockTolerance: 10,
  });
  if (typeof payload.sha256 !== 'string' || !payload.sha256) throw new Error('sha256 was not found in the token');
  const expected = Buffer.from(crypto.createHash('sha256').update(rawBody).digest('base64'));
  const received = Buffer.from(payload.sha256);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error('sha256 checksum of body does not match');
  }
  return payload;
}
```

**Python (PyJWT):**

```python
import base64, hashlib, hmac
import jwt

def verify_livekit_webhook(raw_body: bytes, auth_header: str | None, api_key: str, api_secret: str) -> dict:
    if not auth_header:
        raise ValueError("authorization header is empty")
    token = auth_header.strip()
    if token[:7].lower() == "bearer ":
        token = token[7:].strip()
    claims = jwt.decode(token, key=api_secret, algorithms=["HS256"], issuer=api_key,
                        leeway=10, options={"require": ["exp", "iss"]})
    claimed = claims.get("sha256")
    if not isinstance(claimed, str) or not claimed:
        raise ValueError("sha256 was not found in the token")
    expected = base64.b64encode(hashlib.sha256(raw_body).digest())
    if not hmac.compare_digest(expected, claimed.encode("utf-8", "replace")):
        raise ValueError("sha256 checksum of body does not match")
    return claims
```

Use a timing-safe comparison for the hash (`crypto.timingSafeEqual` after a length check,
`hmac.compare_digest`). LiveKit's Go receiver uses `subtle.ConstantTimeCompare`.

### SDK verification (one-line alternative)

| Language | Package | Call |
|----------|---------|------|
| Node.js | `livekit-server-sdk` | `await new WebhookReceiver(apiKey, apiSecret).receive(rawBody, authHeader)` |
| Python | `livekit-api` | `WebhookReceiver(TokenVerifier(api_key, api_secret)).receive(body_str, auth_header)` |
| Go | `github.com/livekit/protocol/webhook` | `webhook.ReceiveWebhookEvent(r, auth.NewSimpleKeyProvider(apiKey, apiSecret))` |
| Java | `io.livekit:livekit-server` | `new WebhookReceiver(apiKey, secret).receive(postBody, authHeader)` |

Notes:

- The Python receiver takes a `TokenVerifier` instance, not the key and secret directly.
- The Node receiver's optional third and fourth arguments are `skipAuth = false` and
  `clockTolerance`. `skipAuth` exists for local testing only; never default it to `true`.
- The Node receiver does not strip `Bearer `; pass the bare token.
- The SDKs return a protobuf `WebhookEvent`, so int64 fields such as `createdAt` come back
  as `bigint` (Node) / `int` (Python), not strings.

## Common Gotchas

- **Content type.** LiveKit sends `application/webhook+json`, deliberately (the sender's
  comment: "use a custom mime type to ensure signature is checked prior to parsing"). A
  parser bound to `application/json` silently leaves the body empty.
- **Raw body.** The body is protojson output, which is not byte-stable across
  re-serialisation (spacing differs between builds; defaults are omitted). Hash the exact
  bytes received: Express `express.raw({ type: 'application/webhook+json' })`, Next.js
  `await request.text()`, FastAPI `await request.body()`.
- **base64, not hex or base64url.** The claim is standard padded base64 of the raw digest.
- **Short-lived tokens.** `exp` is about 5 minutes after sending. Verify at receipt, not
  when a queued request is processed later.
- **Credentials.** `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are the project pair whose key
  is the webhook's Signing API key. If they are unset, fail closed (401) and log; never
  skip verification or crash.
- **No unsigned requests.** There is no handshake or validation ping, so there is no reason
  for an unsigned-request bypass.
- **No IP allowlist.** LiveKit documents none. The `User-Agent: LiveKit` header is
  unauthenticated.

## Debugging Verification Failures

Work through these in order; they are the real failure modes.

1. **Every delivery 401s / the body is empty.** The body parser isn't bound to
   `application/webhook+json`. In Express, mount
   `express.raw({ type: 'application/webhook+json' })` on the webhook route and make sure a
   global `express.json()` doesn't run first.
2. **"sha256 checksum of body does not match".** The body was parsed and re-serialised (or
   decoded/re-encoded) before hashing. Hash the raw bytes.
3. **"sha256 was not found in the token".** The code verifies the JWT only, or reads the
   wrong claim name. The claim is literally `sha256`.
4. **Token rejected as expired on replay or reprocessing.** Tokens live 5 minutes. Verify
   when the request arrives; store the verified result, not the raw request for later
   verification. (Hookdeck's LiveKit source handles this by checking `exp` against its
   receipt time.)
5. **`iss` mismatch** (jose: `unexpected "iss" claim value`; PyJWT: `Invalid issuer`). The webhook's Signing API key is not
   the key whose secret the receiver holds. Common when a project has several API keys;
   look up the secret by the token's `iss`.
6. **Fields missing from the payload.** Not a verification failure: protojson omits
   zero/default values (including enum zero values like `AUDIO` and `JOINING`). Read
   fields defensively.
7. **`numDropped` > 0.** The sender's queue overflowed and events were lost before this
   delivery. Reconcile state via the RoomService API (`ListRooms`, `ListParticipants`).
