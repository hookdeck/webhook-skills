# Setting Up Zapier Webhooks

## Prerequisites

- A Zapier account (Webhooks by Zapier is available on Free, Professional, Team and Enterprise plans)
- Your endpoint's public URL (for local development, see below)

## Create Your Shared Secret

Zapier doesn't issue a signing secret, so you make one:

```bash
openssl rand -hex 32
```

Store it as `ZAPIER_WEBHOOK_SECRET` in your app's environment. To use Basic Auth instead, choose a username and password and set `ZAPIER_BASIC_AUTH_USERNAME` and `ZAPIER_BASIC_AUTH_PASSWORD`.

## Add the Webhook Action to Your Zap

1. In the Zap editor, click **+** to add an action step.
2. Search for and select **Webhooks by Zapier**.
3. In **Event**, choose **POST** (or **PUT**, or **Custom Request** for PATCH/DELETE, nested JSON arrays or empty values). Click **Continue**. The examples accept POST, PUT, PATCH and DELETE.
4. Choose the **Payload Type**: **JSON** is easiest to handle; Form, XML and Raw also work with the examples.
5. Enter your endpoint in **URL**, e.g. `https://example.com/webhooks/zapier`. Put any query parameters in Data rather than the URL.
6. Fill in **Data** with key/value pairs, mapping fields from earlier steps. Optionally add `event | <your-name>` so your handler can tell Zaps apart. If you leave Data blank, all fields from the previous step are sent.

## Add Authentication

Pick one:

**Shared-secret header** (recommended). In **Headers** add:

| Key | Value |
|-----|-------|
| `X-Webhook-Secret` | the value of `ZAPIER_WEBHOOK_SECRET` |

**Basic Auth**. In the **Basic Auth** field enter the username and password separated by a pipe:

```
your-username|your-password
```

Zapier sends `Authorization: Basic base64(username:password)`.

Use HTTPS so the secret isn't sent in clear text.

## Test the Step

Click **Test step**. Zapier sends a real request using sample data from earlier steps. Check that your endpoint returns `200`. A `401` means the header name or value (or Basic Auth pair) doesn't match your environment.

## Local Development

```bash
npx hookdeck-cli listen 3000 zapier --path /webhooks/zapier   # Express / Next.js
npx hookdeck-cli listen 8000 zapier --path /webhooks/zapier   # FastAPI
```

No account required. Paste the public URL the CLI prints into the action's **URL** field.

## Need an IP Allowlist?

On Professional, Team or Enterprise plans Zapier offers a static IP for outbound requests. Use it as well as the shared secret, not instead of it.
