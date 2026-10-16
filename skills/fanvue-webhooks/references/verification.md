# Fanvue Signature Verification

Source: [Verify webhook signatures](https://api.fanvue.com/docs/webhooks/signature-verification)

## The Signature Header

Every delivery carries `X-Fanvue-Signature`:

```
X-Fanvue-Signature: t=<timestamp>,v0=<signature>
```

| Field | Meaning |
|---|---|
| `t` | Unix timestamp in seconds, recording when Fanvue signed the request |
| `v0` | HMAC-SHA256 of `<t>.<raw body>`, hex encoded |

During a signing-secret rotation the header carries **two** MACs:

```
X-Fanvue-Signature: t=1749458373,v0=<old hex>,<new hex>
```

The second MAC is a bare field with no `=`; it continues the `v0` list.

## How Verification Works

1. **Parse the header.** Split on `,`. Read `t` and collect every `v0` value, including bare fields that follow a `v0=` field. Reject when `t` is missing, repeated or not a plain decimal number, or when no MAC is present.
2. **Rebuild the signed content.** Concatenate `t`, a period and the **raw** request body: `{t}.{body}`. Use the exact bytes Fanvue sent.
3. **Compute the expected MAC.** HMAC-SHA256 over the signed content, keyed with the signing secret, hex digest.
4. **Compare in constant time against every MAC.** Accept when **any** one matches (`crypto.timingSafeEqual` in Node, `hmac.compare_digest` in Python).
5. **Reject stale timestamps.** Reject when `t` is more than **300 seconds** from now. `t` is inside the signed content, so a replayed delivery can't have it refreshed.

When verification fails, respond **`401`**.

## Implementation

Node:

```javascript
const crypto = require('crypto');

function parseSignatureHeader(header) {
  let key;
  let timestamp;
  let timestampCount = 0;
  const macs = [];

  for (const field of header.split(',')) {
    const separator = field.indexOf('=');
    if (separator !== -1) key = field.slice(0, separator).trim();
    // With separator === -1 this is the whole bare field.
    const value = field.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
      timestampCount += 1;
    } else if (key === 'v0' && value) {
      macs.push(value.toLowerCase());
    }
  }

  return { timestamp, timestampCount, macs };
}

function verifyFanvueSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!header) return false;
  const { timestamp, timestampCount, macs } = parseSignatureHeader(header);
  if (timestampCount !== 1 || !/^[0-9]+$/.test(timestamp) || macs.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac('sha256', secret)       // secret verbatim, whsec_ and all
    .update(`${timestamp}.`)
    .update(rawBody)                     // Buffer of the raw body
    .digest('hex');

  return macs.some(
    (mac) =>
      mac.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}
```

Python:

```python
import hashlib
import hmac
import re
import time

_DECIMAL = re.compile(r"[0-9]+")


def verify_fanvue_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header:
        return False
    key, timestamp, timestamp_count, macs = None, None, 0, []
    for field in header.split(","):
        if "=" in field:
            key, _, value = field.partition("=")
            key = key.strip()
        else:
            value = field  # bare rotation MAC continues the previous key
        value = value.strip()
        if key == "t":
            timestamp, timestamp_count = value, timestamp_count + 1
        elif key == "v0" and value:
            macs.append(value.lower())

    if timestamp_count != 1 or not timestamp or not _DECIMAL.fullmatch(timestamp) or not macs:
        return False
    if abs(int(time.time()) - int(timestamp)) > 300:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),  # secret verbatim, whsec_ and all
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return any(hmac.compare_digest(expected, mac) for mac in macs)
```

The runnable, tested versions live in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## The Unsigned Verification Probe

Before `POST /webhooks/subscriptions` creates a subscription, Fanvue sends one
request with **no** `X-Fanvue-Signature` header:

```json
{ "type": "fanvue.webhook.verification", "timestamp": "2026-06-09T08:39:33.139Z" }
```

| Rule | Behaviour |
|---|---|
| Response | Any `2xx` passes. Any other status fails the subscribe call |
| Redirects | Not followed. A `3xx` fails the subscribe call, so register the final URL |
| Timeout | 8 seconds |
| Signature | None |

This is the one exception to "verify everything". Parse the body, and if `type`
is `fanvue.webhook.verification`, return `2xx` **before** checking the signature.
The probe carries no event data, so do no processing on that path. Return `401` to
every other unsigned request.

Only the API path probes; the Events tab does not. A handler that answers `401`
to every unsigned request works when registered from the Events tab and fails
when registered through the API.

## Which Secret Signs the Delivery

| Registered via | Secret |
|---|---|
| Developer Area **Events** tab, or `webhooks.destinations` in the App Manifest | The per-app secret from **View signing secret**, shared by every endpoint on the app |
| `POST /webhooks/subscriptions` | The per-subscription `signingSecret` (`whsec_` + 64 hex), returned once in the create response |

The two paths don't share a secret. Each API subscription has its own, so store
one per subscription id and pick the right one when verifying.

## Common Gotchas

### 1. Using the parsed body

Parsing the JSON and re-serialising it changes the bytes, and the MAC won't match.
Capture the raw body before any JSON middleware runs:

- **Express:** `express.raw({ type: 'application/json' })` on the webhook route
- **Next.js App Router:** `await request.text()`, never `JSON.stringify(await request.json())`
- **FastAPI:** `await request.body()`

### 2. Dropping the rotation MAC

A keyed parse such as `Object.fromEntries(header.split(',').map(p => p.split('=')))`
keeps only the first `v0` and loses the bare second MAC. During the rotation
overlap every delivery signed with the newer secret then fails. Parse statefully
and accept any match.

### 3. Altering the secret

Use the secret exactly as Fanvue gives it. Don't strip the `whsec_` prefix and
don't hex- or base64-decode it: the whole string is the HMAC key. The docs don't
spell this out in prose, but Fanvue's own Node and Python samples pass
`FANVUE_WEBHOOK_SECRET` straight into `createHmac` / `hmac.new` with no decode
step — unlike Svix-style `whsec_` secrets, which must be base64-decoded.

### 4. Rejecting the probe

Returning `401` (or redirecting) for the unsigned
`fanvue.webhook.verification` body makes `POST /webhooks/subscriptions` fail.

### 5. Trusting X-Fanvue-Topic

Deliveries also carry an `X-Fanvue-Topic` header, but the signature covers only
`<t>.<raw body>`, so the header is unauthenticated. Derive the topic from the
signed body: `type` on envelope events, field presence on legacy events.

### 6. Wrong secret for the registration path

An Events tab or manifest delivery is signed with the per-app secret; an API
subscription delivery with that subscription's `signingSecret`. Mixing them up
fails every delivery with "Invalid signature".

### 7. Clock skew

The 300-second window is measured against your server clock. Keep it synced with
NTP.

### 8. Non-constant-time comparison

A plain `==` leaks the MAC through timing differences. Use
`crypto.timingSafeEqual` (check lengths first, it throws on mismatch) or
`hmac.compare_digest`.

## Debugging Checklist

1. Is the probe answered with `2xx` before the signature check?
2. Is the HMAC computed over the raw bytes, prefixed with `<t>.`?
3. Is the digest hex (not base64)?
4. Is the secret the right one for the registration path, used verbatim?
5. Are both MACs compared during rotation?
6. Is the server clock within 300 seconds of real time?

A test delivery (Events tab **Test**, or `POST /webhooks/test`) carries a real
signature, so a `200` proves the check end to end.
