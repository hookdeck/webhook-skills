# Setting Up OpenClaw Webhooks

## Prerequisites

- An OpenClaw Gateway instance (running locally or remotely)
- Access to the Gateway configuration file (`~/.openclaw/openclaw.json`)
- Your application's webhook endpoint URL

## Generate a Hook Token

```bash
openssl rand -hex 32
```

Store this token securely -- you'll need it for both the Gateway config and your webhook receiver.

## Enable Webhooks in Gateway Config

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

### Configuration Options

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

## Expose the Gateway

The Gateway webhook server listens on `http://127.0.0.1:18789` by default. To receive webhooks from external services, expose this endpoint:

### Option 1: Hookdeck CLI (Recommended)

```bash
# Install
brew install hookdeck/hookdeck/hookdeck
# or: npm i -g hookdeck-cli

# Start tunnel
hookdeck listen 18789 --path /hooks/agent
```

Hookdeck provides a stable public URL, automatic retries, queuing, and a dashboard for inspecting webhook deliveries.

### Option 2: ngrok

```bash
ngrok http 18789
```

### Option 3: Reverse Proxy

In production, place the Gateway behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) with HTTPS.

## Test Webhook Delivery

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

## Recommended Security Config

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

## Environment Variables

```bash
# .env
OPENCLAW_HOOK_TOKEN=your-generated-token
```

## Full Documentation

- [OpenClaw Webhook Documentation](https://docs.openclaw.ai/automation/webhook)
- [Using Hookdeck with OpenClaw](https://hookdeck.com/webhooks/platforms/using-hookdeck-with-openclaw-reliable-webhooks-for-your-ai-agent)
