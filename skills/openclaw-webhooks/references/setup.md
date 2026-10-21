# Setting Up OpenClaw Webhooks

## Receiving Automation Webhooks

### 1. Set a Webhook Token

Generate a dedicated token (not the Gateway auth token, and not `hooks.token`):

```bash
openssl rand -hex 32
```

Add it to the Gateway config ([Manage automations](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs#configuration)):

```json5
{
  cron: {
    enabled: true,
    webhookToken: "your-generated-token",
  },
}
```

OpenClaw then sends `Authorization: Bearer your-generated-token` on every automation webhook POST.

### 2. Point an Automation at Your Endpoint

```bash
# New job
openclaw automations create "0 18 * * 1-5" \
  "Summarize today's deploys as JSON." \
  --name "Deploy digest" \
  --webhook "https://your-app.example.com/webhooks/openclaw"

# Existing job
openclaw automations edit <jobId> --webhook "https://your-app.example.com/webhooks/openclaw"
```

Don't put credentials in the URL; OpenClaw rejects `user:password@` URLs.

### 3. Receive Through Hookdeck (Optional)

Create a Hookdeck connection with an **OpenClaw** source and use its URL as the `--webhook` target. Set the source's API key to the full header value, `Bearer your-generated-token`. Hookdeck verifies the header, then queues, retries and forwards to your app. OpenClaw itself doesn't retry an ambiguous send.

For local development:

```bash
npx hookdeck-cli listen 3000 openclaw --path /webhooks/openclaw
```

### 4. Configure Your Receiver

```bash
# .env
OPENCLAW_WEBHOOK_TOKEN=your-generated-token
```

### 5. Test It

```bash
openclaw automations run <jobId> --wait
```

Or simulate a delivery:

```bash
curl -X POST http://localhost:3000/webhooks/openclaw \
  -H 'Authorization: Bearer your-generated-token' \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"job_123","action":"finished","runId":"run_abc","status":"ok","completionStatus":"succeeded","summary":"Test run"}'
```

## Calling OpenClaw's Inbound Hooks

The rest of this page sets up the other direction: external services sending events to the Gateway's `/hooks/*` endpoints.

### Prerequisites

- An OpenClaw Gateway instance (running locally or remotely)
- Access to the Gateway configuration file (`~/.openclaw/openclaw.json`)
- A service that will call the Gateway

### Generate a Hook Token

```bash
openssl rand -hex 32
```

Store this token securely; callers send it as `Authorization: Bearer <token>`.

### Enable Webhooks in Gateway Config

Edit `~/.openclaw/openclaw.json` (or use `openclaw config set`):

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-generated-token",
    "path": "/hooks",
    "allowedAgentIds": ["*"]
  }
}
```

Or use the CLI (hot-reloads without restarting the Gateway):

```bash
openclaw config set hooks.enabled true --strict-json
openclaw config set hooks.token "your-generated-token"
openclaw config set hooks.path "/hooks"
openclaw config set hooks.allowedAgentIds '["*"]' --strict-json
```

#### Configuration Options

| Field | Default | Description |
|-------|---------|-------------|
| `hooks.enabled` | `false` | Enable the webhook HTTP server |
| `hooks.token` | (required) | Shared secret for authentication |
| `hooks.path` | `/hooks` | Base path for webhook endpoints |
| `hooks.allowedAgentIds` | `["*"]` | Agent IDs allowed for explicit routing. `["*"]` = any. `[]` = deny all |
| `hooks.defaultSessionKey` | -- | Default session key for hook agent runs |
| `hooks.allowRequestSessionKey` | `false` | Allow callers to set `sessionKey` in payload |
| `hooks.allowedSessionKeyPrefixes` | -- | Restrict session key values (e.g. `["hook:"]`) |
| `hooks.mappings` | -- | Named hook mappings with transforms |
| `hooks.transformsDir` | -- | Directory for custom JS/TS transform modules |

### Expose the Gateway

The Gateway webhook server listens on `http://127.0.0.1:18789` by default. To receive webhooks from external services, expose this endpoint:

#### Option 1: Hookdeck CLI (Recommended)

```bash
npx hookdeck-cli listen 18789 openclaw --path /hooks/agent
```

Hookdeck provides a stable public URL, automatic retries, queuing, and a dashboard for inspecting webhook deliveries.

#### Option 2: ngrok

```bash
ngrok http 18789
```

#### Option 3: Reverse Proxy

In production, place the Gateway behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) with HTTPS.

### Test Webhook Delivery

```bash
# Test agent hook
curl -X POST http://127.0.0.1:18789/hooks/agent \
  -H 'Authorization: Bearer your-generated-token' \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from webhook test", "name": "Test"}'

# Expected: 202 Accepted

# Test wake hook
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Authorization: Bearer your-generated-token' \
  -H 'Content-Type: application/json' \
  -d '{"text": "Wake up!", "mode": "now"}'

# Expected: 200 OK
```

### Recommended Security Config

```json
{
  "hooks": {
    "enabled": true,
    "token": "your-generated-token",
    "defaultSessionKey": "hook:ingress",
    "allowRequestSessionKey": false,
    "allowedSessionKeyPrefixes": ["hook:"],
    "allowedAgentIds": ["hooks", "main"]
  }
}
```

## Full Documentation

- [Manage automations](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs)
- [Inbound webhooks](https://docs.openclaw.ai/automation/cron-jobs/webhooks)
- [Using Hookdeck with OpenClaw](https://hookdeck.com/webhooks/platforms/using-hookdeck-with-openclaw-reliable-webhooks-for-your-ai-agent)
