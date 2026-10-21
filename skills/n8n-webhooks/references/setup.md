# Setting Up n8n to Send Requests to Your App

## Prerequisites

- An n8n instance (n8n Cloud or self-hosted) and a workflow to send from
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 n8n --path /webhooks/n8n
```

(Use port `8000` for the FastAPI example.)

## 1. Generate a Shared Secret

```bash
openssl rand -hex 32
```

Put it in your app's `.env` as `N8N_WEBHOOK_SECRET`.

## 2. Add an HTTP Request Node

1. In your workflow, add an **HTTP Request** node.
2. **Method**: `POST`.
3. **URL**: your endpoint, e.g. `https://your-app.example.com/webhooks/n8n`.

## 3. Configure Authentication

Set **Authentication** to **Generic Credential Type**, then pick one **Generic Auth Type**:

### Header Auth (recommended)

1. **Generic Auth Type**: **Header Auth** → **Create New Credential**.
2. **Name**: `X-Webhook-Secret` (any name works; set `N8N_WEBHOOK_HEADER` in your app if you
   pick a different one).
3. **Value**: the secret from step 1.

### Bearer Auth

1. **Generic Auth Type**: **Bearer Auth** → **Create New Credential**.
2. **Bearer Token**: the secret from step 1.

n8n sends it as `Authorization: Bearer <token>`.

### Basic Auth

1. **Generic Auth Type**: **Basic Auth** → **Create New Credential**.
2. **User** and **Password**: match `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD`.

Storing the secret in a credential (rather than a plain **Send Headers** entry) keeps it
encrypted and out of exported workflow JSON.

## 4. Configure the Body

1. Turn on **Send Body**.
2. **Body Content Type**: **JSON**.
3. **Specify Body**: **Using JSON**, and include an `event` field:

```json
{
  "event": "order.created",
  "id": "{{ $execution.id }}-{{ $itemIndex }}",
  "data": {{ JSON.stringify($json) }}
}
```

## 5. Optional Node Settings

- **Options → Batching**: pace requests when a step outputs many items (the node sends one
  request per item).
- **Options → Timeout**: how long n8n waits for your response.
- **Settings → Retry On Fail** (with **Max Tries** and **Wait Between Tries**): retry when your
  endpoint returns an error. Make your handler idempotent on `id` if you turn this on.
- **Options → Response → Never Error**: treat any status code as success. Leave it off so
  `401`/`500` responses show up as failed executions.

## 6. Test

Click **Execute step** on the HTTP Request node. A `200` shows the response in the node
output; a `401` means the secret or header name doesn't match your `.env`.
