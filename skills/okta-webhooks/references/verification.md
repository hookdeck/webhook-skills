# Okta Event Hook Verification & Authentication

## How It Works

Okta Event Hooks secure delivery with **two** mechanisms — and notably **no HMAC
signature** over the payload:

1. **One-time verification challenge** (proves you own the endpoint)
2. **Per-request `Authorization` header secret** (authenticates every delivery)

There is no official Okta SDK for verifying inbound event hooks — verification is
a simple header check, so all frameworks implement it manually.

## 1. One-Time Verification Challenge

When you register (or click **Verify** on) the hook, Okta sends a **GET** request:

```
GET /webhooks/okta HTTP/1.1
x-okta-verification-challenge: 8T3z...long-random-string
```

Your endpoint must respond `200` with the challenge echoed back:

```json
{ "verification": "8T3z...long-random-string" }
```

Notes:

- The header name is `x-okta-verification-challenge` (HTTP headers are
  case-insensitive; most frameworks lowercase them).
- The response key must be exactly `verification`.
- Respond with `Content-Type: application/json`.

### Node (Express)

```javascript
app.get('/webhooks/okta', (req, res) => {
  const challenge = req.headers['x-okta-verification-challenge'];
  res.status(200).json({ verification: challenge });
});
```

### Next.js (App Router)

```typescript
export async function GET(request: NextRequest) {
  const challenge = request.headers.get('x-okta-verification-challenge');
  return NextResponse.json({ verification: challenge });
}
```

### Python (FastAPI)

```python
@app.get("/webhooks/okta")
async def verify(request: Request):
    challenge = request.headers.get("x-okta-verification-challenge")
    return {"verification": challenge}
```

## 2. Per-Request Authentication (Authorization header)

On every event **POST**, Okta includes the `Authorization` header with the secret
value you configured when creating the hook. Compare it against your stored secret
using a **timing-safe** comparison to avoid leaking the secret via response timing.

### Node — manual timing-safe compare

```javascript
const crypto = require('crypto');

function isAuthorized(authHeader, secret) {
  const a = Buffer.from(authHeader || '', 'utf8');
  const b = Buffer.from(secret || '', 'utf8');
  // Length check first — crypto.timingSafeEqual throws on unequal lengths
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// In the POST handler:
if (!isAuthorized(req.headers['authorization'], process.env.OKTA_WEBHOOK_SECRET)) {
  return res.status(401).send('Unauthorized');
}
```

### Python — manual timing-safe compare

```python
import hmac

def is_authorized(auth_header: str, secret: str) -> bool:
    if not auth_header or not secret:
        return False
    return hmac.compare_digest(auth_header, secret)
```

## Common Gotchas

- **No HMAC.** Don't look for a signature header — there isn't one. Auth is the
  static `Authorization` header value.
- **Echo the challenge exactly.** The verification response key must be
  `verification`, and the value must be the exact challenge string. Any extra
  wrapping or a wrong key fails verification.
- **GET vs POST.** The verification handshake is a **GET**; event deliveries are
  **POST**. Wire up both on the same path.
- **Timing-safe comparison.** Use `crypto.timingSafeEqual` (Node) or
  `hmac.compare_digest` (Python). A plain `===`/`==` leaks length and content
  timing. Guard against unequal-length buffers so `timingSafeEqual` doesn't throw.
- **Return `2xx` fast.** Okta retries on non-`2xx` or timeouts. Acknowledge first,
  process asynchronously.
- **Multiple events per POST.** Iterate `data.events[]` — a single request can
  carry several events.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Verification failed" in Admin Console | GET handler missing or wrong response shape | Return `{"verification": "<challenge>"}` with `200` |
| Every POST returns 401 | `OKTA_WEBHOOK_SECRET` doesn't match the Admin Console value | Re-enter the same secret in both places |
| Challenge value is `null` | Reading the wrong header name | Read `x-okta-verification-challenge` (lowercased) |
| Handler works locally, fails from Okta | Endpoint not publicly reachable / not HTTPS | Use a tunnel (Hookdeck CLI) or deploy behind HTTPS |
