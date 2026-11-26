# Setting Up Cursor Webhooks

Cursor's docs describe no dashboard setting for webhooks. A webhook belongs to one Cloud Agent, and you set it when you create that agent through the API.

## Prerequisites

- A Cursor API key (Cursor Dashboard > API Keys) or a service account API key
- Your application's HTTPS webhook endpoint URL

## Choose a Secret

You choose the secret yourself. It must be at least 32 characters (the v0 OpenAPI spec allows up to 256). The API accepts a webhook without one, but Cursor's docs don't say what such an agent sends, so always set one:

```bash
openssl rand -hex 32
```

Cursor uses the secret as a plain string, so don't decode it.

## Create an Agent With a Webhook

Webhooks are only in the legacy v0 Cloud Agents API. The current API lists webhooks as coming soon, and v0 remains available during the migration window.

```bash
curl --request POST \
  --url https://api.cursor.com/v0/agents \
  -u YOUR_API_KEY: \
  --header 'Content-Type: application/json' \
  --data '{
  "prompt": { "text": "Add a README.md file with installation instructions" },
  "source": { "repository": "https://github.com/your-org/your-repo", "ref": "main" },
  "webhook": {
    "url": "https://yourdomain.com/webhooks/cursor",
    "secret": "YOUR_WEBHOOK_SECRET_AT_LEAST_32_CHARACTERS"
  }
}'
```

- `webhook.url` is required inside the `webhook` object.
- There is no event selection: the agent sends `statusChange` when it reaches `FINISHED` or `ERROR`.
- Cursor documents no way to change an agent's webhook later. A new URL or secret applies to agents you create from then on.

## Test Your Webhook

Cursor documents no test button or sample delivery. Start a tunnel, then create a small agent with the tunnel URL as `webhook.url`:

```bash
npx hookdeck-cli listen 3000 cursor --path /webhooks/cursor
```

## Recover a Missed Result

Cursor publishes no retry schedule or resend. If a webhook doesn't arrive, read the agent:

```bash
curl --request GET \
  --url https://api.cursor.com/v0/agents/bc_abc123 \
  -u YOUR_API_KEY:
```

## Environment Configuration

```bash
# .env file
CURSOR_WEBHOOK_SECRET=your_webhook_secret_here
```

## Best Practices (from Cursor's docs)

- Verify signatures
- Handle retries: webhooks may be retried if your endpoint returns an error status code
- Return a 2xx status code as soon as possible
- Use HTTPS URLs in production
- Store raw payloads for debugging
