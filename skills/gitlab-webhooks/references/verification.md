# How to Verify GitLab Webhooks

## Which Mechanism Does GitLab Use?

GitLab has two ways to authenticate a webhook, and you can configure both on the same webhook:

| | Signing token (recommended) | Secret token (legacy) |
|---|---|---|
| Available | GitLab 19.0+ (behind the `webhook_signing_token` flag, on by default); generally available in 19.1 | All versions |
| What GitLab sends | `webhook-signature: v1,<base64>` plus `webhook-id` and `webhook-timestamp` | The token itself, in plain text, in `X-Gitlab-Token` |
| Algorithm | HMAC-SHA256 ([Standard Webhooks](https://www.standardwebhooks.com/)) | None (string comparison) |
| Protects body integrity | Yes | No |

GitLab's docs say the secret token "is not recommended for new webhooks". Use the signing token when your GitLab instance supports it.

Source: [GitLab webhooks: Signing tokens](https://docs.gitlab.com/user/project/integrations/webhooks/#signing-tokens).

## How Signing-Token Verification Works

GitLab follows the Standard Webhooks specification:

1. **Signed content:** `{webhook-id}.{webhook-timestamp}.{body}`, where `{body}` is the raw JSON request body.
2. **Key:** the signing token with the `whsec_` prefix stripped, then base64-decoded.
3. **Signature:** HMAC-SHA256 of the signed content, base64-encoded, prefixed with `v1,`.
4. **Header:** `webhook-signature` holds a space-separated list of signatures. GitLab currently sends one, but says this might change, so accept a match on any entry.
5. **Comparison:** constant-time.
6. **Replay:** GitLab says to check that `webhook-timestamp` is recent but gives no number. The Standard Webhooks spec asks for "some allowable tolerance". The examples use 5 minutes, the default in the Standard Webhooks reference libraries.

## Implementation

### JavaScript (Node.js)

```javascript
const crypto = require('crypto');

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

// rawBody must be the exact bytes GitLab sent (a Buffer)
function verifyGitLabSignature(rawBody, headers, signingToken) {
  const webhookId = headers['webhook-id'];
  const webhookTimestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!signingToken || !webhookId || !webhookTimestamp || !signatureHeader) {
    return false;
  }

  const timestamp = Number(webhookTimestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const key = Buffer.from(signingToken.replace(/^whsec_/, ''), 'base64');
  const digest = crypto
    .createHmac('sha256', key)
    .update(`${webhookId}.${webhookTimestamp}.`)
    .update(rawBody)
    .digest('base64');
  const expected = Buffer.from(`v1,${digest}`);

  return signatureHeader.split(' ').some((signature) => {
    const received = Buffer.from(signature);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

// Usage in Express: use express.raw so the body is not re-serialized
app.post('/webhooks/gitlab', express.raw({ type: 'application/json' }), (req, res) => {
  if (!verifyGitLabSignature(req.body, req.headers, process.env.GITLAB_WEBHOOK_SIGNING_TOKEN)) {
    return res.status(401).send('Unauthorized');
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  // Process webhook...
});
```

### Python

This follows GitLab's own Python example, plus the timestamp check:

```python
import base64
import hashlib
import hmac
import time

TIMESTAMP_TOLERANCE_SECONDS = 5 * 60

def verify_gitlab_signature(raw_body: bytes, headers, signing_token: str) -> bool:
    webhook_id = headers.get("webhook-id")
    webhook_timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (signing_token and webhook_id and webhook_timestamp and signature_header):
        return False

    try:
        timestamp = int(webhook_timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        return False

    key = base64.b64decode(signing_token.removeprefix("whsec_"))
    message = f"{webhook_id}.{webhook_timestamp}.".encode("utf-8") + raw_body
    expected = "v1," + base64.b64encode(hmac.new(key, message, hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(expected, sig) for sig in signature_header.split(" "))

# Usage in FastAPI
@app.post("/webhooks/gitlab")
async def webhook_handler(request: Request):
    raw_body = await request.body()
    if not verify_gitlab_signature(raw_body, request.headers, os.getenv("GITLAB_WEBHOOK_SIGNING_TOKEN")):
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    # Process webhook...
```

### Using a Standard Webhooks library

Because GitLab follows the spec, the Standard Webhooks reference libraries (`standardwebhooks` on npm and PyPI) can verify GitLab requests too: they accept a `whsec_` secret, read the `webhook-*` headers and apply a 5-minute timestamp tolerance. GitLab itself doesn't publish an SDK for webhook verification.

## Legacy Secret Token (X-Gitlab-Token)

If a secret token is configured, GitLab sends it back unchanged in `X-Gitlab-Token`. There is no signature: compare the header with your stored token, in constant time.

```javascript
function verifyGitLabToken(tokenHeader, secret) {
  if (!tokenHeader || !secret) return false;
  const a = Buffer.from(tokenHeader);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```python
import secrets

def verify_gitlab_token(token_header: str, secret: str) -> bool:
    if not token_header or not secret:
        return False
    return secrets.compare_digest(token_header, secret)
```

The token only proves the sender knows the secret. It doesn't protect the body from tampering and, being plain text, it is exposed wherever the request is logged.

## Migrating from the Secret Token to a Signing Token

GitLab's advice for a zero-downtime switch:

1. Configure both tokens on the webhook.
2. In your receiver, verify the signature when `webhook-signature` is present, and fall back to the secret token otherwise.
3. Once signatures verify, remove the secret token from the webhook settings.

```javascript
function verifyGitLabWebhook(rawBody, headers) {
  const signingToken = process.env.GITLAB_WEBHOOK_SIGNING_TOKEN;
  if (signingToken && headers['webhook-signature']) {
    // A request that carries a signature must pass it; never fall back
    return verifyGitLabSignature(rawBody, headers, signingToken);
  }
  return verifyGitLabToken(headers['x-gitlab-token'], process.env.GITLAB_WEBHOOK_TOKEN);
}
```

## Common Gotchas

### 1. Verifying a re-serialized body

The signature covers the raw bytes. Parsing the JSON and calling `JSON.stringify` again changes whitespace and key order, so the HMAC won't match. Use `express.raw()`, `await request.arrayBuffer()` in Next.js, or `await request.body()` in FastAPI, and parse only after verifying.

### 2. Using the signing token as the HMAC key directly

Strip `whsec_` and base64-decode the rest. Using the string as-is produces a different key.

### 3. Comparing only the first signature

`webhook-signature` is a space-separated list. Check every entry.

### 4. Header name case

GitLab documents the Standard Webhooks headers in lowercase (`webhook-signature`). Express and Starlette lowercase header names, and `Headers.get()` in Next.js is case-insensitive.

### 5. Clock skew

A server clock that drifts more than the tolerance rejects valid requests. Keep NTP running.

## Debugging Verification Failures

### 1. Check which headers arrived

```javascript
console.log({
  id: req.headers['webhook-id'],
  timestamp: req.headers['webhook-timestamp'],
  signature: req.headers['webhook-signature'],
  hasLegacyToken: Boolean(req.headers['x-gitlab-token']),
});
```

No `webhook-signature` means the webhook has no signing token configured (or the instance is older than 19.0).

### 2. Check your implementation against a known vector

The Standard Webhooks reference library's test suite signs `{"test": 2432232314}` with id `msg_p5jXN8AQM9LWM0D4loKWxJek`, timestamp `1614265330` and secret `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`, giving `v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=`. All three examples test against it.

### 3. Use GitLab's test feature

In **Settings** > **Webhooks**, select **Test** for your webhook and check:
- The **Recent events** tab for request headers and the response
- The response status code (should be 2xx)
- The response time (must be under 10 seconds)
