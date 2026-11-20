# How to Verify Roblox Webhook Signatures

## How Does the Roblox Signature Work?

From [Verify webhook security](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications#verify-webhook-security). When a webhook has a secret, every notification to a custom endpoint carries:

```
roblox-signature: t=<timestamp>,v1=<signature>
```

- **Header name:** `roblox-signature`. Roblox documents it in lowercase. Read it case-insensitively (Node and Starlette lowercase incoming headers anyway).
- **Format:** "a CSV string" of `key=value` members. Split on `,`, then find the `t=` and `v1=` members. Don't rely on their order or on there being exactly two.
- **`t`:** "The timestamp of when the notification was sent." Unix time in **seconds** (Roblox's sample multiplies it by 1000 to get milliseconds).
- **`v1`:** "The signature value generated using the secret provided by the Creator Dashboard configuration."

To compute the expected signature:

1. Build the base string: the timestamp as a string, then the period character `.`, then the JSON string of the request body. In other words, `<t>.<body>`.
2. Compute HMAC-SHA256 with the webhook secret (UTF-8 bytes) as the key and the base string as the message.
3. Encode the digest as **standard base64 with padding**. Not hex, and not base64url.
4. Compare it to `v1` in constant time.
5. Check that `t` is within your replay window.

This isn't Standard Webhooks: there's no `webhook-id` or `webhook-timestamp` header. The layout looks like Stripe's (`t=...,v1=...`), but the digest is base64 rather than hex.

### Why Does the Replay Window Matter?

The timestamp is part of the signed base string, so an attacker can't change it without breaking the HMAC. That means checking `t` against your clock really does limit replays.

Roblox gives two figures:

- The prose: "a 10-minute window is usually a good reasonable time limit."
- The runnable sample: "Ensure the request came within a 300 second window to prevent replay attacks."

Roblox marks the check as optional. The examples keep it on, default to **300 seconds**, and read `ROBLOX_WEBHOOK_TOLERANCE_SECONDS` if you need more (up to the documented 600). They reject timestamps that are too far in the future as well as too old.

## What If There's No Secret?

The secret is optional when you create the webhook. Without one:

```
roblox-signature: t=<timestamp>
```

There's no `v1`, so there's nothing to verify, and anyone who learns the URL can send notifications. That includes fake right-to-erasure requests that would delete player data. The examples:

- return **500** if `ROBLOX_WEBHOOK_SECRET` is unset (fail closed, without crashing at import time),
- return **401** if the header is missing,
- return **401** if the header has no `v1`. There's deliberately no "no `v1`, so skip the check" branch, because a forged request would look exactly like that.

Fix it by setting a secret on the webhook in the Creator Dashboard.

## Should I Sign the Raw Body or Re-serialised JSON?

Roblox's sample builds the base string from the body *after* `express.json()` parsed it:

```javascript
const message = `${timestamp}.${JSON.stringify(req.body)}`;
const hmac = crypto.createHmac('sha256', secret);
const calculatedSignature = hmac.update(message).digest('base64');
```

The prose says "the JSON string of the request body", which could mean either form. The examples in this skill sign the **raw request body bytes** (`express.raw()`, `request.arrayBuffer()`, `await request.body()`):

- Assuming Roblox sends compact JSON (unconfirmed — the payloads in the docs are formatted for display, which says nothing about the wire body), the two forms agree for ordinary payloads, and the test suites check that on their fixtures.
- But `JSON.stringify(parsed)` isn't byte-stable, even for compact JSON. A round trip rewrites escaped characters (`"a\/b"` → `"a/b"`) and normalises numbers (`1.0` → `1`, `1e2` → `100`); numeric-looking keys get reordered; and any middleware that mutates `req.body` silently breaks the signature. The raw body has none of these problems, so it is the safer choice.

This is an engineering choice, not proof of what Roblox intends. Only a live delivery can settle that. If you ever see a signed Test Response fail on the raw body but pass on `JSON.stringify(JSON.parse(raw))`, please report it.

## Implementation

Roblox has no SDK for webhook verification, so all three examples verify manually.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyRobloxSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!secret || !header) return false;
  let t = null;
  const sigs = [];
  for (const member of header.split(',')) {
    const i = member.indexOf('=');
    if (i < 0) continue;
    const key = member.slice(0, i).trim();
    const value = member.slice(i + 1).trim();   // keep base64 '=' padding
    if (key === 't') t = value;
    else if (key === 'v1' && value) sigs.push(value);
  }
  if (!/^\d+$/.test(t || '') || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('base64')
  );
  return sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && crypto.timingSafeEqual(b, expected);
  });
}
```

`crypto.timingSafeEqual` throws on unequal lengths, so check the length first. Roblox's sample uses `!==`, which isn't constant-time.

### Python (FastAPI)

```python
import base64, hashlib, hmac, re, time

def verify_roblox_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    if not secret or not header:
        return False
    t, sigs = None, []
    for member in header.split(","):
        key, sep, value = member.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            t = value
        elif key == "v1" and value:
            sigs.append(value)
    if not t or not re.fullmatch(r"[0-9]+", t) or not sigs:
        return False
    if abs(int(time.time()) - int(t)) > tolerance:
        return False
    digest = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    return any(hmac.compare_digest(s.encode(), expected) for s in sigs)
```

Compare bytes rather than `str`: `hmac.compare_digest` raises `TypeError` on non-ASCII strings.

### Test Vector

| Input | Value |
|---|---|
| Secret | `roblox_test_secret` |
| `t` | `1700000000` |
| Body | `{"NotificationId":"test","EventType":"SampleNotification","EventTime":"2023-12-30T16:24:24.2118874Z","EventPayload":{"UserId":1}}` |
| Base string | `1700000000.` + body |
| Expected `v1` | `9gGo8glBNiM69Kw9sLT69cG12dTQovB+C6KacIvo1i4=` |

## Third-Party (Discord / Slack) Variant

If the webhook URL points at Discord or Slack, the signature goes in the message **footer**, not a header:

```
Roblox-Signature: UIe6GJ78MHCmU/zUKBYP3LV0lAqwWRFR6UEfPt1xBFw=, Timestamp: 1683927229
```

The base string is `<timestamp>.<human-readable message text>`, not JSON. Roblox's example:

```
168487229.You have received a new notification for Right to Erasure for the User Id: XXXXXXXX in the game(s) with Ids: YYYYYYY, ZZZZZZZZZ
```

The algorithm is the same (HMAC-SHA256, base64). Roblox's [automation guide](https://create.roblox.com/docs/cloud/webhooks/automate-right-to-erasure) parses the footer with `Roblox-Signature: (.*), Timestamp: (.*)`. A custom endpoint, including one behind Hookdeck, always gets the header form.

## Common Gotchas

- **Parsed before verifying.** `express.json()`, `request.json()` or a Pydantic body model ran first. Capture the raw bytes.
- **Base string order.** It's `<t>.<body>`, timestamp first, with a literal `.` and nothing else.
- **Hex digest.** Roblox uses base64. A 64-character hex string never matches.
- **Splitting on every `=`.** Base64 signatures end in `=` padding. Split each member on the first `=` only.
- **Milliseconds.** `t` is in seconds. Comparing it with `Date.now()` directly makes every request look 55 years old.
- **No `v1`.** The webhook has no secret. Set one; don't add a bypass.
- **Wrong credential.** The HMAC key is the webhook secret, not an Open Cloud API key.

## How to Debug Verification Failures

1. Log the raw `roblox-signature` header and the raw body length. Never log the secret.
2. If there's no `v1=`, add a secret to the webhook and click **Test Response**.
3. Recompute by hand with the test vector above to confirm your HMAC code.
4. Check that the body you're signing is byte-for-byte what arrived: no trimming, no re-encoding, no pretty-printing.
5. Check your server clock (NTP) if you get `timestamp_outside_tolerance` on fresh deliveries.
6. Check for whitespace or a trailing newline around the secret in your environment.
