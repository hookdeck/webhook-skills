# How to Verify Papergames Webhook Signatures

## How Does Papergames Sign Webhooks?

Papergames sends webhooks through Svix. The security page says: "papergames.io uses SVIX to send Webhooks. Therefore the recommended way to verify webhooks is using the official libraries from SVIX." Every request has three headers, all with the **`svix-` prefix** (not the neutral `webhook-` prefix some Svix tenants use):

| Header | Value |
|--------|-------|
| `svix-id` | Unique message ID. It stays the **same** when a message is resent after a failure, so it's your idempotency key |
| `svix-timestamp` | Unix timestamp in **seconds** |
| `svix-signature` | Space-delimited list of versioned signatures, each `v1,<base64>` |

The signature is:

```
signedContent = "${svix_id}.${svix_timestamp}.${body}"
signature     = base64( HMAC-SHA256( key, signedContent ) )
```

- `body` is the **raw** request body. Don't parse and re-serialize it before verifying.
- `key` is the base64-**decoded** part of the secret after `whsec_`. The docs' example: for `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, decode `MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`. If a secret was stored without the prefix, base64-decode the whole value (the Standard Webhooks rule, and what Hookdeck's verifier does). Refuse a secret that decodes to zero bytes.
- The digest is standard padded base64 (not hex, not base64url).

The documented header example:

```
v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE= v1,bm9ldHUjKzFob2VudXRob2VodWUzMjRvdWVvdW9ldQo= v2,MzJsNDk4MzI0K2VvdSMjMTEjQEBAQDEyMzMzMzEyMwo=
```

Split on spaces, drop the `v1,` prefix, and accept if **any** `v1` entry matches. There's usually one entry; you'll see more during a secret rotation. The `v2` entry in that example is illustrative only. Papergames documents no `v2` scheme, so ignore any version tag other than `v1`. Compare in constant time.

## Implementation

### Manual verification (used by all three examples)

**Node.js** (Express, Next.js):

```javascript
const crypto = require('crypto');

function verifyPapergames(rawBody, headers, secret) {
  const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = Buffer.from(encoded, 'base64'); // the docs use deprecated new Buffer(); use Buffer.from
  if (key.length === 0) throw new Error('Invalid secret');

  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64')
  );
  return headers['svix-signature'].split(' ').some((entry) => {
    const [version, sig] = entry.split(',', 2);
    if (version !== 'v1' || !sig) return false;
    const candidate = Buffer.from(sig);
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}
```

**Python** (FastAPI):

```python
import base64, hashlib, hmac

def verify_papergames(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> bool:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    if not key:
        raise ValueError("Invalid secret")
    signed = f"{msg_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and sig and hmac.compare_digest(sig.encode(), expected):
            return True
    return False
```

The examples also check that `svix-timestamp` is a positive integer within the configured window before computing the HMAC.

### Svix library (supported alternative)

The official [`svix`](https://www.npmjs.com/package/svix) package (npm, and [`svix`](https://pypi.org/project/svix/) on PyPI) does the same check:

```javascript
const { Webhook } = require('svix');

const wh = new Webhook(process.env.PAPERGAMES_WEBHOOK_SECRET); // full whsec_... value
const event = wh.verify(rawBody, {
  'svix-id': req.get('svix-id'),
  'svix-timestamp': req.get('svix-timestamp'),
  'svix-signature': req.get('svix-signature'),
}); // throws WebhookVerificationError on a bad signature or a timestamp outside 5 minutes
```

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["PAPERGAMES_WEBHOOK_SECRET"])
event = wh.verify(raw_body, dict(request.headers))  # raises WebhookVerificationError
```

The library's timestamp window is fixed at 5 minutes. The examples use the manual version so the window can be configured (see below).

## What Timestamp Tolerance Should I Use?

The docs say to compare `svix-timestamp` with your clock and "make sure it's within your tolerance", but they don't give a number. The timestamp is inside the signed content, so changing it already breaks the signature. The window only limits how long a captured request can be replayed.

The examples read `PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS`: default `300` (the Svix libraries' 5-minute default), `0` to disable. They check both directions, so a timestamp too far in the future is rejected too.

Weigh this against the retry schedule (immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h). Papergames doesn't say whether a retry carries a fresh `svix-timestamp` or the original one. If it's the original, or if anything between Svix and your handler stores and redelivers the request (Hookdeck retries or replays, your own queue), a strict 5-minute window silently drops the 30-minute, 2-hour, 5-hour and 10-hour retries. If you see late deliveries rejected with "Timestamp outside tolerance", widen the window (for example to `86400`) or set it to `0`, and deduplicate on `svix-id` so a replayed message is processed once.

## Common Gotchas

- **Raw body.** In Express use `express.raw()` on the route (the example uses `type: '*/*'`); `express.json()` breaks verification. In Next.js use `await request.text()`. In FastAPI use `await request.body()`. Parse JSON only after verifying.
- **Decode the secret.** Using the `whsec_...` string itself as the HMAC key is the most common mistake. Base64-decode the part after `whsec_`.
- **Header prefix.** Papergames sends `svix-id` / `svix-timestamp` / `svix-signature`. A verifier that only reads `webhook-*` headers sees nothing and rejects every request.
- **Signature list.** The header can hold several space-separated entries. Strip the `v1,` prefix, check every entry, and don't treat the whole header as one signature.
- **Payload shape.** After verification, route on `body.eventType` and read the session from `body.payload`. Not `type` / `data`.
- **No other authentication.** Inbound webhooks carry no `X-Api-Key`, bearer token, mTLS certificate or `x-papergames-*` header, and Papergames publishes no IP allowlist. The signature is the only check.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Secret not base64-decoded, wrong endpoint's secret, or body parsed before verifying |
| Fails only behind a proxy or framework middleware | Something rewrote the body (JSON re-serialization, charset change, whitespace) |
| `Missing svix-... header` | Reading `webhook-*` names, or a proxy is stripping headers |
| `Timestamp outside tolerance` on late deliveries | Window is too strict for retries or replays; widen it (see above) |
| Works locally, fails in production | `PAPERGAMES_WEBHOOK_SECRET` not set or set to another environment's endpoint secret |

To check your code, sign a known body yourself with the algorithm above and compare. The example tests include a fixed vector: secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, `svix-id` `msg_2KWPBgLlAfxdpx2AI54pPJ85f4W`, `svix-timestamp` `1699007668`, body `{"eventType":"game.started","payload":{"uid":"8qgmUmqJj"}}` gives `v1,BXFMEbfDNtVqz0PXYTcA6U1v7YTjH7mjbbpo/XBfvxw=`. The dashboard's **view logs** shows the payload and HTTP status of every attempt.

## Docs

- [Security](https://developers.papergames.io/docs/webhooks/security)
- [Svix: verifying payloads](https://docs.svix.com/receiving/verifying-payloads/how)
