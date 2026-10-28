# Verifying Whatnot Webhooks

## The Scheme

Whatnot follows the [Standard Webhooks](https://www.standardwebhooks.com)
specification, with its own `wn_wh_` secret prefix.

| | |
|---|---|
| Headers | `webhook-id`, `webhook-timestamp`, `webhook-signature` |
| Algorithm | HMAC-SHA256 |
| Key | The dashboard secret with `wn_wh_` stripped, then **base64-decoded** to raw bytes |
| Signed content | `{webhook-id}.{webhook-timestamp}.{raw body}`, dot-separated, body as the exact received bytes |
| Encoding | Standard base64 (not base64url) |
| Header format | Space-separated list of `v1,<signature>` entries. Valid if **any** entry matches |
| Timestamp | Reject if `webhook-timestamp` is more than 5 minutes (300 s) from your clock |

Source: [Webhooks guide](https://developers.whatnot.com/getting-started/webhooks#verifying-signatures).

`webhook-timestamp` is when **this attempt** was sent, and every retry is
re-signed with a fresh one, so the 5-minute window doesn't reject legitimate
retries even days later. It's different from the payload's ISO 8601
`timestamp`, which records when the event happened and stays the same across
retries.

## Whatnot's Sample (no library)

Verbatim from the webhooks guide:

```python
import base64
import hashlib
import hmac
import time

def verify(raw_body, headers, webhook_secret) -> bool:
    key = base64.b64decode(webhook_secret.removeprefix("wn_wh_"))
    msg_id = headers["webhook-id"]
    timestamp = headers["webhook-timestamp"]
    if abs(time.time() - int(timestamp)) > 5 * 60:
        return False
    signed_content = f"{msg_id}.{timestamp}.".encode() + raw_body
    digest = hmac.digest(key, signed_content, hashlib.sha256)
    expected = base64.b64encode(digest).decode()
    for entry in headers["webhook-signature"].split(" "):
        version, _, signature = entry.partition(",")
        if version == "v1" and hmac.compare_digest(signature, expected):
            return True
    return False
```

`raw_body` is `bytes`. It raises `KeyError` on a missing header and
`ValueError` on a non-numeric timestamp, so catch those and respond 400.

## Node.js (no library)

```javascript
const crypto = require('crypto');

function verifyWhatnot(rawBody, headers, secret) {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sigs = headers['webhook-signature'];
  if (!id || !ts || !sigs || !/^\d+$/.test(ts)) return false;

  // 5-minute tolerance, either direction.
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > 300) return false;

  // Strip wn_wh_, then base64-decode: the key is the decoded bytes.
  const key = Buffer.from(secret.replace(/^wn_wh_/, ''), 'base64');
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(`${id}.${ts}.`).update(rawBody).digest('base64')
  );

  return sigs.split(' ').some((entry) => {
    const [version, sig = ''] = entry.split(',');
    const received = Buffer.from(sig);
    // timingSafeEqual throws on a length mismatch, so check first.
    return version === 'v1' && received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}
```

`rawBody` can be a `Buffer` or the exact body string.

## With the `standardwebhooks` Library

The examples use the official library: npm `standardwebhooks` (^1.1.1) and
PyPI `standardwebhooks` (>=1.1.0). Packages also exist for Go
(`github.com/standard-webhooks/standard-webhooks/libraries/go`), Ruby
(`standardwebhooks`), PHP (`standard-webhooks/standard-webhooks`) and .NET
(`StandardWebhooks`).

```javascript
const { Webhook } = require('standardwebhooks');
const secret = process.env.WHATNOT_WEBHOOK_SECRET.replace(/^wn_wh_/, '');
const event = new Webhook(secret).verify(rawBody, {
  'webhook-id': req.get('webhook-id'),
  'webhook-timestamp': req.get('webhook-timestamp'),
  'webhook-signature': req.get('webhook-signature'),
}); // throws WebhookVerificationError
```

```python
from standardwebhooks.webhooks import Webhook

secret = os.environ["WHATNOT_WEBHOOK_SECRET"].removeprefix("wn_wh_")
event = Webhook(secret).verify(await request.body(), dict(request.headers))  # raises WebhookVerificationError
```

**Strip `wn_wh_` yourself.** The libraries only strip their own `whsec_`
prefix. Left on, `wn_wh_` makes the Node library throw on invalid base64, and
makes the Python (and Ruby) library silently decode a wrong key, so every
check fails with no hint why.

The libraries enforce a fixed 5-minute tolerance you can't configure. To test
against an old signed delivery, freeze the clock (see the examples' tests).

## Getting the Raw Body

| Framework | How |
|---|---|
| Express | `express.raw({ type: '*/*' })` on the webhook route, then `req.body` is a `Buffer` |
| Next.js (App Router) | `await request.text()` before any `JSON.parse` |
| FastAPI | `await request.body()` |

Whatnot sends space-separated JSON (`{"type": "shows.started", ...}`). Parsing
and re-serializing it produces compact JSON with different bytes, so the
signature won't match. Don't put `express.json()` or any JSON body parser in
front of the webhook route.

## Golden Test Vector

Whatnot's guide publishes a signed delivery and the secret that signed it.
We recomputed the HMAC and it matches, so the examples' tests use it as a real
test case.

```
secret            : wn_wh_AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=
webhook-id        : 0b7e4f6c-3d1a-4a8e-9f2b-5c6d7e8f9a0b
webhook-timestamp : 1792512005
webhook-signature : v1,8m/VX9GLLqhNZJndMpPw7OTUKSDI4szDXAmIFY8ffBI=
body              : {"type": "shows.started", "timestamp": "2026-10-20T16:00:00.123Z", "data": {"show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c"}, "version": "v2", "seller_id": "1234567"}
```

- The body is a single line with no trailing newline, and it has a space after
  every `:` and `,`. In JavaScript tests, use it as a string literal.
  `JSON.stringify` emits compact JSON and won't reproduce the signature.
- The timestamp is in the past, so freeze your clock at `1792512005` (Jest or
  Vitest fake timers, or a patched clock in pytest) rather than removing the
  tolerance check from your verifier.

## Debugging Failures

| Symptom | Likely cause |
|---|---|
| Every delivery fails | You forgot to strip `wn_wh_` before base64-decoding (or before passing the secret to a Standard Webhooks library) |
| Every delivery fails, prefix stripped | You used the base64 text as the HMAC key instead of the decoded bytes, or the secret has stray whitespace |
| Fails on every payload, golden vector included | A JSON body parser ran before verification and you're signing re-serialized JSON |
| "Message timestamp too old/new" | Server clock skew, or a proxy replayed the request with its original headers more than 5 minutes later |
| Only the first `v1,` entry is checked | Split `webhook-signature` on spaces and accept a match on any entry |
| Headers missing | The request didn't come from Whatnot, a proxy stripped them, or the sender is still on the legacy `X-Whatnot-Webhook-Signature` scheme |
| 500s on bad signatures | `timingSafeEqual` threw on a length mismatch. Compare lengths first |

To check your secret, verify a captured delivery (the Hookdeck CLI's web UI
shows the raw body and headers) with your clock frozen at its
`webhook-timestamp`.

## What Whatnot Doesn't Provide

- **No source IP allowlist** is documented.
- **No handshake or verification challenge** when you subscribe.
- **No Whatnot SDK** for verification. Use a Standard Webhooks library or the
  code above.
