# How to Verify OpenMeter Webhook Signatures

## How Does OpenMeter Sign Webhooks?

OpenMeter delivers notifications through Svix, so signatures follow the Svix
scheme (the same as [Standard Webhooks](https://www.standardwebhooks.com/)).

| Header | Value |
|--------|-------|
| `svix-id` | Unique message ID (`msg_...`); stable across retries |
| `svix-timestamp` | Unix timestamp in **seconds** |
| `svix-signature` | Space-delimited list of `v1,<base64 signature>` entries |

Algorithm:

1. Signed content: `${svix-id}.${svix-timestamp}.${raw_body}`
2. Key: the secret with the optional `whsec_` prefix removed, then **base64-decoded**
3. Signature: `base64(HMAC-SHA256(key, signed_content))`
4. Valid if it matches **any** `v1,` entry (several appear during secret rotation), compared in constant time
5. Reject timestamps more than 5 minutes from now (replay protection)

## SDK Verification (Recommended)

OpenMeter's own docs use the `svix` SDK. It exists for Node.js and Python, so
all three examples in this skill use it.

### Node.js (Express / Next.js)

```javascript
import { Webhook, WebhookVerificationError } from 'svix'; // svix 2.x is ESM-only

const wh = new Webhook(process.env.OPENMETER_WEBHOOK_SECRET);
try {
  wh.verify(rawBody, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature'],
  });
} catch (err) {
  // err instanceof WebhookVerificationError → respond 400
}
const event = JSON.parse(rawBody);
```

### Python (FastAPI)

```python
from svix.webhooks import Webhook, WebhookVerificationError

wh = Webhook(os.environ["OPENMETER_WEBHOOK_SECRET"])
try:
    wh.verify(raw_body, {
        "svix-id": headers["svix-id"],
        "svix-timestamp": headers["svix-timestamp"],
        "svix-signature": headers["svix-signature"],
    })
except WebhookVerificationError:
    ...  # respond 400
event = json.loads(raw_body)
```

## Manual Verification (Fallback)

Use this only where the `svix` SDK isn't available:

```javascript
import crypto from 'node:crypto';

function verifyOpenMeter(rawBody, headers, secret, toleranceSec = 300) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigHeader = headers['svix-signature'];
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest();

  return sigHeader.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

## What Should I Know About Custom Signing Secrets?

OpenMeter lets you set your own `signingSecret` on a channel (pattern
`^(whsec_)?[a-zA-Z0-9+/=]{32,100}$`), and the prefix is optional on OpenMeter's
side. Either way the part after `whsec_` is treated as **base64** and decoded
into the HMAC key.

**Keep the `whsec_` prefix when you set a custom secret.** Svix/Standard
Webhooks libraries and Hookdeck use the prefix to recognise the secret as
base64 and decode it. Without it, a verifier may use the string's raw bytes as
the key and every signature check will fail, even though OpenMeter is signing
correctly. Also make sure the value after the prefix is valid base64 (only
`A-Z a-z 0-9 + / =`): OpenMeter rejects anything else.

## Common Signature Verification Errors

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request fails | Body was parsed and re-serialized before verifying | Verify the **raw** body (`express.raw()`, `request.text()`, `await request.body()`) |
| Every request fails | Secret used as raw bytes instead of base64-decoded | Strip `whsec_`, base64-decode; or let the `svix` SDK do it |
| Every request fails with a custom secret | Custom secret set without `whsec_` and your verifier needs the prefix | Recreate the secret with the `whsec_` prefix, or prefix it in your env var |
| Wrong secret | Copied from another channel, or the channel secret was rotated | Re-read `signingSecret` from the channel |
| "Message timestamp too old" | Server clock skew, or replaying an old capture | Sync NTP; re-send from OpenMeter rather than replaying stale requests |
| Missing headers | A proxy strips `svix-*` headers | Forward all request headers unchanged |

## How Do I Debug Verification Failures?

1. Log the three `svix-*` headers and the raw body length (never the secret).
2. Recompute the signature by hand with the manual function above and compare.
3. Confirm the secret starts with `whsec_` and decodes as base64.
4. Check the event's delivery status via `GET /api/v1/notification/events`.

## Idempotency

Svix retries failed deliveries with the same `svix-id`, and the envelope `id`
is the OpenMeter event ID. Store either one and skip duplicates.
