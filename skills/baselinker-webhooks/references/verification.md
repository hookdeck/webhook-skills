# BaseLinker Webhook Verification

## There Is Nothing to Verify

**BaseLinker provides no signature verification for its outbound callbacks.** Not
a weak scheme, not an optional one — none at all:

- ❌ No HMAC (SHA-1, SHA-256, or otherwise)
- ❌ No signature header of any name
- ❌ No timestamp header, and therefore no replay window to enforce
- ❌ No shared signing secret — none is documented, and Hookdeck's source config
  for BaseLinker accepts no secret at all
- ❌ No handshake, challenge, or subscription-confirmation step
- ❌ No published source-IP allowlist
- ❌ No SDK helper (there is no webhook SDK, because there is no documented webhook)

A delivery is a bare HTTP **HEAD** request with the payload in the query string
and no cryptographic material attached anywhere.

**So do not write a verifier.** Any `verifyBaselinkerSignature()` you see is
fabricated: it has no header to read, no secret to key on, and no signed content
(a HEAD request has no body). Writing one produces a handler that either rejects
every delivery or — worse — appears to check something while checking nothing.

## The Evidence

**1. Hookdeck's source config accepts no secret.** In Hookdeck's API spec the
Baselinker auth schema is empty:

```jsonc
// SourceConfigBaselinkerAuth
{ "properties": {}, "additionalProperties": false }
```

Every HMAC-based source in that same spec carries a `webhook_secret_key` property.
BaseLinker is in the small cohort of **zero-property auth schemas** together with
**AWS SNS, Microsoft Graph, Microsoft SharePoint, Monday, Strava, Tikkie, Ethoca
and Zift**.

**2. There is no handshake either.** Some providers use HEAD as a verification
probe — **Trello** does exactly that. BaseLinker does not: a Baselinker HEAD request is an ordinary delivery. There
is no token to echo, no `X-Hook-Secret` to reflect, nothing to confirm.

**3. BaseLinker documents no webhook at all.** The public API
([api.baselinker.com](https://api.baselinker.com/)) is request/response over
`connector.php` with polling-based change tracking (`getJournalList`,
`getOrderReturnJournalList`, `getInventoryProductLogs`), and neither the English
nor the Polish help centre describes an outbound webhook or a "send HTTP request"
automatic action. There is no specification that could define a signature.

## `X-BLToken` Is Not a Webhook Signature

`X-BLToken` is BaseLinker's **request** authentication header: the token *you*
send on *your* outbound calls to the BaseLinker API.

```bash
# OUTBOUND: your server → BaseLinker. This is where X-BLToken belongs.
curl -X POST https://api.baselinker.com/connector.php \
  -H 'X-BLToken: YOUR_API_TOKEN' \
  -d 'method=getOrders' \
  --data-urlencode 'parameters={"order_id":42}'
```

It **never appears on an inbound delivery**, it is not derived from any payload,
and it must never be presented — or checked — as a webhook signature.

## What to Do Instead

Since the platform gives you no cryptographic authentication, the endpoint's
security rests on transport and topology. Be honest about this in your threat
model: **anyone who learns the URL can forge a delivery.**

### 1. Endpoint-URL secrecy

Use a long, unguessable path and treat the URL as a credential:

```
https://your-app.example.com/webhooks/baselinker/8f3c9a2d7e14b6f0
```

Don't log full request URLs, don't paste the URL into shared docs or tickets, and
rotate it if it leaks.

### 2. Network controls

- HTTPS only.
- A WAF, rate limit, or CDN rule in front of the route.
- An IP allowlist if you can establish the origin addresses for your own account
  (BaseLinker publishes none, so this must be derived from observed traffic and
  re-checked periodically).

### 3. A shared token *you* append to the URL

Because you control the URL you register in the Automatic Action, you can append
your own query param and check it. This is **your** secret round-tripped back to
you — it is *not* provider authentication, and it is visible in the URL, in
browser/proxy logs, and in any Referer chain. It stops opportunistic scans, not a
determined attacker who has seen the URL.

Register:

```
https://your-app.example.com/webhooks/baselinker?order_id=[order_id]&state=packed&token=RANDOM_LONG_VALUE
```

**Node.js**

```javascript
const crypto = require('crypto');

// NOT a BaseLinker signature: a token you appended to the endpoint URL yourself.
function verifyUrlToken(query, expected) {
  if (!expected) return true;                    // not configured — nothing to check
  const provided = query.token;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Python**

```python
import hmac
from typing import Optional


def verify_url_token(provided: Optional[str], expected: Optional[str]) -> bool:
    """Check a token YOU appended to the endpoint URL. BaseLinker signs nothing."""
    if not expected:
        return True  # not configured — nothing to check
    if not provided:
        return False
    return hmac.compare_digest(provided, expected)
```

### 4. Trust the payload as little as possible

The callback carries no body and no proof of origin, so treat `order_id` and
`state` as **untrusted hints**. Re-fetch the authoritative record from the API
before acting on it:

```bash
curl -X POST https://api.baselinker.com/connector.php \
  -H 'X-BLToken: YOUR_API_TOKEN' \
  -d 'method=getOrders' \
  --data-urlencode 'parameters={"order_id":42}'
```

A forged HEAD then costs you (at most) one wasted API lookup rather than an
incorrect state change. Keep `getJournalList` polling as the authoritative change
feed.

## Common Gotchas

- **Don't parse the body.** `req.body` / `await request.json()` /
  `await request.body()` are empty on a HEAD request and parsing will throw or
  yield null. Don't mount a JSON body parser on the route.
- **Register a HEAD route.** `app.head(...)`, an exported `HEAD` function, or
  `@app.head(...)`. Express's `app.get()` answers HEAD too, but be explicit.
- **Query values are always strings.** `Number(order_id)` / `int(order_id)`, then
  validate — never assume a param is present.
- **Respond with no body.** A HEAD response must not carry one
  ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)). Use
  `res.sendStatus(200)`, `new Response(null, { status: 200 })`, or
  `Response(status_code=200)` — never `res.json(...)`.
- **Don't return a JSON error either.** A `400` on a HEAD route must also be
  bodyless; in FastAPI prefer `Response(status_code=400)` over `HTTPException`,
  which renders a JSON body.
- **`X-BLToken` is outbound-only.** It is not, and cannot be turned into, a
  signature.
- **No delivery log in BaseLinker.** Put a proxy (Hookdeck) in front if you need
  to inspect or replay raw requests.

## Debugging

| Symptom | Cause |
|---------|-------|
| `404` / `405` on every delivery | Only a `POST` (or only a `GET`) route is registered — add `app.head` / export `HEAD` / `@app.head`. |
| Handler throws on `JSON.parse` / `await request.json()` | You're reading a body that does not exist. Read the query params. |
| `order_id` compares wrong, arithmetic misbehaves | Query values are strings — coerce with `Number()` / `int()`. |
| Client reports a protocol error on the response | You sent a body on a HEAD response. Return a bare status. |
| Every request rejected by your token check | `BASELINKER_URL_TOKEN` doesn't match the `token` param in the registered URL (watch trailing whitespace and URL-encoding). |
| Can't correlate a delivery with the dashboard | Read the `x-hookdeck-request-id` **response** header — the id can't be returned in a body. |

## Full Documentation

- [BaseLinker API reference](https://api.baselinker.com/) — request/response API,
  `X-BLToken` request header, no webhook methods
- [Automatic actions — system events for orders](https://base.com/en-EN/help/knowledgebase/automatic-actions-system-events-for-orders/)
- [RFC 9110 §9.3.2 (HEAD)](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
