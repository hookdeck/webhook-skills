# How to Verify Cronofy Webhook Signatures

## Why Signature Verification Matters

Cronofy sends **no other authentication credentials** with a push notification. The
`Cronofy-HMAC-SHA256` header is the only proof that a request came from Cronofy. The docs
describe it as a header that "can optionally be used to verify" the notification — treat
verification as **required** anyway. An unauthenticated POST endpoint that triggers
calendar reads and database writes is exactly what the header exists to prevent.

## How It Works

| Property | Value |
|----------|-------|
| Header | `Cronofy-HMAC-SHA256` (case-insensitive on the wire; Node lowercases it to `cronofy-hmac-sha256` in `req.headers`) |
| Algorithm | HMAC-SHA256 |
| Key | Your application's **client secret** (the OAuth secret, prefixed `CRN_`) |
| Signed content | The **raw request body bytes**, exactly as received |
| Encoding | Standard **base64** (includes `+`, `/`, and `=` padding) |
| Header value | A **comma-separated list** of base64 digests — one per active client secret |

There is **no timestamp, no nonce, no channel id, no URL and no method** mixed into the
signed string. The body alone is signed.

### The comma-separated header is the load-bearing detail

Cronofy applications can have two active client secrets simultaneously so you can rotate
without downtime. Every notification is signed with *each* active secret and all digests
are sent in one header:

```
Cronofy-HMAC-SHA256: 5DxentQi5YSXODEzTVv06sRwJ3pULIz1KrYv20qxEK0=,BmQmWVuZ70ILWjr1CAt5oC7YOolgnku4WZtlrKfx/6k=
```

From the docs: "Check that the signature value exists in the comma-separated list of HMACs
passed in the `Cronofy-HMAC-SHA256` header."

A naive `header === computed` comparison **works fine in your tests and then rejects every
single delivery the moment a secret rotation starts.** Split on `,`, trim each element, and
pass if any element matches.

## Implementation

Cronofy publishes official API libraries (cronofy-ruby, cronofy-node, cronofy-python and
others) that include a verify helper, and worked examples at
[github.com/cronofy/notification-hmac-examples](https://github.com/cronofy/notification-hmac-examples)
(Node, PHP, Ruby). **Do not add an SDK dependency just to verify a signature** — stdlib
`crypto` / `hmac` is sufficient and is what Cronofy's own examples show. If you already
depend on a Cronofy SDK for API calls, using its helper is fine.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

/**
 * @param {Buffer|string} rawBody   Raw request body, unparsed
 * @param {string} hmacHeader       Cronofy-HMAC-SHA256 header value
 * @param {string} clientSecret     Your Cronofy application client secret (CRN_...)
 */
function verifyCronofyWebhook(rawBody, hmacHeader, clientSecret) {
  if (!hmacHeader || !clientSecret) return false;

  const expected = Buffer.from(
    crypto.createHmac('sha256', clientSecret).update(rawBody).digest('base64')
  );

  // reduce, not some: every candidate is compared, so a match late in the list
  // isn't distinguishable by timing from a match early in it.
  return hmacHeader.split(',').reduce((matched, candidate) => {
    const buf = Buffer.from(candidate.trim());
    // Guard the length first — timingSafeEqual throws on a length mismatch.
    const ok = buf.length === expected.length && crypto.timingSafeEqual(buf, expected);
    return matched || ok;
  }, false);
}
```

### Python (FastAPI)

```python
import base64
import hashlib
import hmac


def verify_cronofy_webhook(raw_body: bytes, hmac_header: str, client_secret: str) -> bool:
    if not hmac_header or not client_secret:
        return False

    expected = base64.b64encode(
        hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )

    # Compare as BYTES, not str: hmac.compare_digest raises TypeError on str
    # arguments containing non-ASCII characters, and header values reach the app
    # latin-1 decoded — so a hostile header would become an unhandled 500 rather
    # than a clean rejection.
    #
    # List comprehension, not a generator: any() would short-circuit on a
    # generator, making a match's position observable via timing.
    return any(
        [hmac.compare_digest(candidate.strip().encode("utf-8", "replace"), expected)
         for candidate in hmac_header.split(",")]
    )
```

## Verify Your Implementation Against Cronofy's Published Vectors

These are published by Cronofy and safe to embed in tests. Both are reproduced by the
examples' test suites.

| Client secret | Body | Expected digest |
|---|---|---|
| `CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID` | `{"example":"well-known"}` | `5DxentQi5YSXODEzTVv06sRwJ3pULIz1KrYv20qxEK0=` |
| `CRN_nGlYDFXwfSXgB9rvGNBJyfE454GGPtWIbNuPwr` | `{"example":"well-known"}` | `BmQmWVuZ70ILWjr1CAt5oC7YOolgnku4WZtlrKfx/6k=` |

With both secrets active the header is the two joined with a comma and no space.

Note that the second digest contains a `/`. If your implementation produces
`BmQmWVuZ70ILWjr1CAt5oC7YOolgnku4WZtlrKfx_6k` you used **base64url**, which is wrong.

Quick sanity check from a shell:

```bash
printf '%s' '{"example":"well-known"}' \
  | openssl dgst -sha256 -hmac 'CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID' -binary \
  | base64
# 5DxentQi5YSXODEzTVv06sRwJ3pULIz1KrYv20qxEK0=
```

## Common Gotchas

- **Comparing the whole header string.** The header is a list. `header === computed`
  passes today and fails for every delivery during a secret rotation. Split on `,`.
- **Re-serializing the JSON.** The digest covers the raw bytes. `JSON.stringify(req.body)`
  reorders nothing but changes whitespace and unicode escaping, and the HMAC will not
  match. Capture the raw body before any parser touches it.
- **Using the wrong secret.** The key is the **client secret** (`CRN_...`). Not the client
  ID, not an access token, and not a "webhook signing secret" — Cronofy does not issue
  one.
- **base64url instead of base64.** Standard base64 only. Digests contain `+`, `/`, `=`.
- **Inventing headers.** Push notifications document only `Cronofy-HMAC-SHA256` and
  `Content-Type: application/json; charset=utf-8`. There is no `Cronofy-Signature`, no
  delivery-id, no request-id, and no timestamp header on them. (Event Triggers add
  `Cronofy-Notification-ID` and `Cronofy-Notification-Attempt`.)
- **`crypto.timingSafeEqual` throwing.** It raises when buffer lengths differ. Guard the
  length check first, or wrap in try/catch and return `false`.
- **Header case.** Node lowercases incoming headers: `req.headers['cronofy-hmac-sha256']`.
  `request.headers.get('cronofy-hmac-sha256')` in Next.js is case-insensitive. FastAPI's
  `request.headers` is case-insensitive too.
- **Rejecting unknown notification types.** Cronofy asks you to ignore them and still
  return 2xx. Returning 4xx/5xx on an unrecognised type counts as a failed delivery.

## Replay: There Is None, and You Cannot Add a Timestamp Check

Because there is no timestamp and no nonce in the signed content, **Cronofy push
notifications are replayable by design.** Anyone who captures a valid delivery can re-send
it indefinitely and it will verify.

Do not pretend otherwise by adding a tolerance check — there is no signed timestamp to
check against, and `notification.changes_since` is attacker-controllable within a valid
captured body.

What to do instead:

- **Idempotency, not staleness.** Make the downstream Read Events sync idempotent (upsert
  on `event_uid`).
  A replayed `change` then costs one redundant API read and nothing else.
- **Optional URL token.** Cronofy suggests embedding a secret token in the `callback_url`
  itself, which can differ per channel. It's defence in depth — a cheap pre-filter, not a
  signature.
- **HTTPS everywhere**, so deliveries can't be captured in the first place.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails, including your own curl tests | Wrong secret. Confirm it starts with `CRN_` and is the client **secret**, not the client ID |
| Works in tests, fails in production | Body parser ran before you captured the raw body. In Express use `express.raw()` on the webhook route; in Next.js use `request.arrayBuffer()`/`request.text()`; in FastAPI use `await request.body()` |
| Worked yesterday, fails today, header suddenly longer | A secret rotation started and you're comparing the whole header instead of splitting on `,` |
| Digest matches except for one or two characters | base64url vs base64. Look for `-`/`_` where you expect `+`/`/` |
| `TypeError: Input buffers must have the same byte length` | `timingSafeEqual` on differently sized buffers — guard the length first |
| Header is `undefined` | Reading `cronofy-signature`, `x-cronofy-signature`, or another header that doesn't exist |
| Nothing arrives at all any more | The channel was closed. 24 hours of failed deliveries closes it permanently — list channels and recreate |
| A `verification` notification never arrives | The endpoint wasn't reachable when the channel was created, or you're on a different data centre host than you think |

To isolate whether the problem is your HMAC or your raw-body plumbing, log
`Buffer.byteLength(rawBody)` alongside the computed digest and compare against the shell
`openssl` command above using the exact bytes you logged.

## Official Documentation

- [Authentication of push notifications](https://docs.cronofy.com/api-reference/authorization/webhook-authentication/)
- [Push Notifications](https://docs.cronofy.com/api-reference/calendar-control/push-notifications/)
- [cronofy/notification-hmac-examples](https://github.com/cronofy/notification-hmac-examples)
