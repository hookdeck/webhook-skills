# Claude Managed Agents Signature Verification

## How It Works

Claude Managed Agents webhooks follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification. Every delivery carries three headers:

- `webhook-id` — a unique message identifier (use it for idempotency).
- `webhook-timestamp` — Unix timestamp in seconds when the event was signed.
- `webhook-signature` — one or more space-separated `v1,<base64-sig>` pairs.

The signature is HMAC-SHA256 over:

```
{webhook-id}.{webhook-timestamp}.{raw-request-body}
```

The signing key is the `whsec_`-prefixed value generated in Console. Strip the `whsec_` prefix and base64-decode the remainder to get the raw 32-byte HMAC key.

Anthropic rejects (and your code should reject) deliveries with a `webhook-timestamp` more than five minutes from the current time to prevent replay attacks.

## Implementation

### Anthropic SDK (Preferred When Available)

The Anthropic SDK wraps Standard Webhooks verification in `client.beta.webhooks.unwrap()`. It reads `ANTHROPIC_WEBHOOK_SIGNING_KEY` from the environment, throws if the signature is invalid or the payload is older than five minutes, and returns a parsed event object.

**TypeScript / Node.js (`@anthropic-ai/sdk`):**

```typescript
import express from "express";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_WEBHOOK_SIGNING_KEY from env
const app = express();

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = client.beta.webhooks.unwrap(req.body.toString("utf8"), {
      headers: req.headers as Record<string, string>,
    });
  } catch {
    return res.status(400).send("invalid signature");
  }

  if (event.data.type === "session.status_idled") {
    console.log("session idled:", event.data.id);
  }
  res.sendStatus(200);
});
```

**Python (`anthropic[webhooks]`):**

```python
from flask import Flask, request
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_WEBHOOK_SIGNING_KEY from env
app = Flask(__name__)

@app.route("/webhook", methods=["POST"])
def webhook():
    try:
        event = client.beta.webhooks.unwrap(
            request.get_data(as_text=True),
            headers=dict(request.headers),
        )
    except Exception:
        return "invalid signature", 400

    if event.data.type == "session.status_idled":
        print("session idled:", event.data.id)
    return "", 200
```

The SDK is available in [TypeScript/Node.js, Python, Go, C#, Java, PHP, and Ruby](https://platform.claude.com/docs/en/managed-agents/webhooks).

### Manual Verification (Framework-Agnostic Fallback)

Manual verification works in any framework or runtime where the SDK isn't a fit (edge runtimes, lambdas with strict bundle budgets, languages without an Anthropic SDK).

**Node.js:**

```javascript
const crypto = require('crypto');

function verifyClaudeSignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) {
    return false;
  }

  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  // whsec_ prefix wraps a base64-encoded key
  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  // The header may carry multiple space-separated "v1,<sig>" pairs (during rotation)
  return webhookSignature.split(' ').some(pair => {
    const [version, signature] = pair.split(',');
    if (version !== 'v1' || !signature) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      return false;
    }
  });
}
```

**Python:**

```python
import hmac, hashlib, base64, time

def verify_claude_signature(payload, webhook_id, webhook_timestamp, webhook_signature, secret):
    if not webhook_id or not webhook_timestamp or not webhook_signature or ',' not in webhook_signature:
        return False

    # Reject payloads older than 5 minutes
    try:
        timestamp_diff = int(time.time()) - int(webhook_timestamp)
    except ValueError:
        return False
    if timestamp_diff > 300 or timestamp_diff < -300:
        return False

    signed_content = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"

    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    secret_bytes = base64.b64decode(secret_key)

    expected_signature = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8')

    for pair in webhook_signature.split(' '):
        parts = pair.split(',', 1)
        if len(parts) != 2:
            continue
        version, signature = parts
        if version == 'v1' and hmac.compare_digest(signature, expected_signature):
            return True
    return False
```

## Common Gotchas

### 1. Use the raw body

The signature is computed over the raw bytes, including whitespace and ordering. Parsing JSON and re-serializing changes the bytes and breaks verification.

```javascript
// WRONG — body has been parsed and re-serialised
app.use(express.json());

// CORRECT — keep the raw bytes on this route
app.post('/webhooks/claude-managed-agents',
  express.raw({ type: 'application/json' }),
  handler
);
```

In Next.js App Router, call `request.text()` (not `request.json()`) to get the raw body. In FastAPI, call `await request.body()` before any `await request.json()`.

### 2. Header names are lowercase

HTTP header names are case-insensitive, but Standard Webhooks uses lowercase canonical names: `webhook-id`, `webhook-timestamp`, `webhook-signature`. Most frameworks normalise to lowercase — read them that way.

### 3. Switch on `data.type`, not `type`

Every delivery has top-level `type: "event"`. The actual event type (e.g. `session.status_idled`) lives at `event.data.type`. Switching on `event.type` will always match `"event"` and skip your handlers.

### 4. The signature header can contain multiple signatures

During key rotation the signature header may carry multiple space-separated `v1,<sig>` pairs. Accept the delivery if **any** of them matches your computed signature. The Anthropic SDK does this automatically.

### 5. Use timing-safe comparison

A plain `===` or `==` comparison leaks timing information. Use `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python).

### 6. Reject stale payloads

The Anthropic SDK rejects payloads older than 5 minutes. Manual implementations must check `webhook-timestamp` themselves — otherwise an attacker who captures a single valid delivery can replay it forever.

### 7. Payloads carry only the type and id

`event.data` contains only the type, id, and workspace metadata — not the full resource. Fetch it with the SDK (`client.beta.sessions.retrieve(event.data.id)`) before acting. This avoids stale data on retries.

## Debugging Verification Failures

Log the basics before suspecting the signing logic:

```javascript
console.log('body type:', typeof req.body, Buffer.isBuffer(req.body));
console.log('body length:', req.body.length);
console.log('first 80 chars:', req.body.toString().slice(0, 80));
console.log('webhook-id:', req.headers['webhook-id']);
console.log('webhook-timestamp:', req.headers['webhook-timestamp']);
console.log('webhook-signature:', req.headers['webhook-signature']);
console.log('secret prefix:', process.env.ANTHROPIC_WEBHOOK_SIGNING_KEY?.slice(0, 8));
```

Common failure modes:

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `Invalid signature` on every delivery | Body parsed before verification | Use `express.raw()` / `request.text()` / `await request.body()` |
| Verification works locally but fails through a proxy | Proxy is gzipping or reformatting the body | Disable body transformation or move verification before the proxy |
| Signature passes but `event.type` is always `event` | Switching on top-level `type` instead of `data.type` | Use `event.data.type` |
| `Webhook timestamp too old` for legitimate deliveries | Server clock drift | Sync NTP; check container time |
| Tests pass but production fails | Secret in env doesn't match Console | Re-copy the `whsec_...` value; check for trailing whitespace |

## Security Best Practices

1. **Verify first, parse second, handle idempotently third** — see [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md).
2. **Never log the signing secret or full signature.**
3. **Always require HTTPS** in production — Anthropic refuses to deliver to non-HTTPS endpoints anyway.
4. **Deduplicate by `event.id`.** Retries reuse the same id; treat duplicates as a no-op.
5. **Reject stale payloads** even if your framework doesn't — the 5-minute window is what makes Standard Webhooks replay-safe.
