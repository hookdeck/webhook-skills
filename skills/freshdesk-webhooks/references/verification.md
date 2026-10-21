# How to Verify Freshdesk Webhooks

## Does Freshdesk Sign Webhooks?

No. Freshdesk's webhook documentation describes no signature, signing secret,
HMAC or timestamp header. These headers **do not exist**:

- `X-Freshdesk-Signature`
- `X-Freshdesk-Webhook-Signature`
- `X-Hub-Signature`

Freshdesk gives you two ways to attach credentials to the request:

| Option | Documented behaviour | Recommendation |
|---|---|---|
| **Add custom headers** | "convey additional information such as security details". Format `X-Sample-CustomHeader1: VALUE`, one per line. "Header names are not case-sensitive … The custom header values will be preserved as is." | **Use this.** You control the exact header and value. |
| **Requires authentication** | "Toggle Requires authentication and provide your API key." | Freshdesk doesn't document the wire format (header name, scheme or encoding), so you can't verify it reliably. Leave it off. |

## How the Shared-Secret Header Works

1. Generate a long random value: `openssl rand -hex 32`.
2. Add it to the rule's custom headers, e.g.
   `X-Freshdesk-Webhook-Secret: 3f9c0e7b...`.
3. In your handler, read that header before parsing the body and compare it to
   `FRESHDESK_WEBHOOK_SECRET` in constant time.

This proves the request came from someone who knows the secret. Unlike an HMAC,
it doesn't prove the body wasn't changed in transit, so always use HTTPS.

## Implementation

There's no Freshdesk SDK for webhook verification. All three examples use the
same manual check.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifyFreshdeskSecret(headerValue) {
  const expected = process.env.FRESHDESK_WEBHOOK_SECRET;
  if (!expected) throw new Error('FRESHDESK_WEBHOOK_SECRET is not set'); // fail closed
  if (typeof headerValue !== 'string') return false;
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const headerName = process.env.FRESHDESK_WEBHOOK_HEADER || 'X-Freshdesk-Webhook-Secret';
// Express:  verifyFreshdeskSecret(req.get(headerName))
// Next.js:  verifyFreshdeskSecret(request.headers.get(headerName))
```

### Python (FastAPI)

```python
import hmac
import os


def verify_freshdesk_secret(header_value: str | None) -> bool:
    expected = os.environ.get("FRESHDESK_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("FRESHDESK_WEBHOOK_SECRET is not set")  # fail closed
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())

# request.headers is case-insensitive in Starlette:
# verify_freshdesk_secret(request.headers.get(header_name))
```

## Response Codes

| Situation | Status | Why |
|---|---|---|
| `FRESHDESK_WEBHOOK_SECRET` not configured | `500` | Fail closed: never accept every request because of a missing env var |
| Header missing or wrong | `401` | Bad credential |
| Body isn't valid JSON, or has no `event` field | `400` | Misconfigured rule. Freshdesk will retry and email admins, which tells them |
| Unknown `event` value | `200` | Logged and ignored. Retrying won't help |
| Handled | `200` | |

Any non-2xx response makes Freshdesk retry every 30 minutes, up to 48 calls.

## Common Gotchas

- **Don't use a plain `===` / `==`.** Use `crypto.timingSafeEqual` or
  `hmac.compare_digest`. `timingSafeEqual` throws if the lengths differ, so
  check the length first.
- **Header case.** Freshdesk treats the name you enter as case-insensitive, and
  Express, the Fetch `Headers` API and Starlette all look headers up
  case-insensitively. Don't compare raw header keys yourself.
- **Spaces in headers.** Freshdesk: "The trigger will not be executed if there
  are spaces in between. If a space is entered at the end of the header, it
  will be skipped." Use a hex secret. A `Bearer <token>` value contains a space,
  so avoid it here.
- **Commas and colons in values.** "A header containing more than one value
  should be separated by delimiters (other than commas and colons)". Hex
  secrets avoid this.
- **Check before parsing.** Verify the header before you parse the body, so
  unauthenticated requests never reach your JSON parser or business logic.
- **The payload is user-written.** Anyone with admin access to automations can
  see the secret and change the body. Treat field values as hints, and
  re-fetch the ticket from the Freshdesk API before doing anything important.
- **No replay protection.** There's no timestamp, so a captured request can be
  replayed. Make your handlers idempotent; you need that for Freshdesk's 48
  retries anyway.

## Debugging Verification Failures

| Symptom | Likely Cause |
|---|---|
| Every request returns `401` | Header name in Freshdesk doesn't match `FRESHDESK_WEBHOOK_HEADER`, or there's trailing whitespace in your `.env` value |
| `500 Webhook secret not configured` | `FRESHDESK_WEBHOOK_SECRET` isn't loaded (check `.env` / `.env.local`) |
| Rule fires but no request arrives | A space in a custom header stops the trigger. Check the admin failure email |
| `400 Invalid JSON` | Encoding is XML / XML-Encoded, or a placeholder value broke the JSON (unescaped quotes) |
| Same ticket processed many times | Freshdesk retries non-2xx responses every 30 minutes. Return 2xx quickly and dedupe |

## With Hookdeck

Hookdeck's **Freshdesk** source type verifies the header for you: you enter the
header name and its exact value. Requests that don't match are rejected before
they reach your app. To confirm on your server that a request came through
Hookdeck, verify Hookdeck's own `x-hookdeck-signature`; see the
[hookdeck-event-gateway skill](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway).
