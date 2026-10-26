# Setting Up WebinarJam Webhooks

## Prerequisites

- A WebinarJam or EverWebinar account
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Connect the Custom Webhook

1. Click **Profile** (top right) > **Integrations** > **Autoresponder**.
2. Select **Custom Webhook**.
3. Enter the **Base webhook URL**, for example `https://example.com/webhooks/webinarjam`.
4. Choose the **Authentication type** (only needed if your endpoint expects it):
   - **Bearer token**: "The token will be sent as an authorization header with each request."
   - **Custom header**: enter the header name and value you want sent.

For the Bearer token option, enter Authorization as the header name and "Bearer <token>" as the value.

Generate a long random string for the token or value and store the **exact, whole value** as
`WEBINARJAM_WEBHOOK_SECRET` (for example `Bearer 3f9a...`), with the header name in
`WEBINARJAM_WEBHOOK_HEADER` (default `Authorization`). The handler compares the whole value, so
a `Bearer ` prefix typed in WebinarJam must also be in the environment variable.

## Create Automation Rules

1. Edit your webinar and open the **Integrations** tab.
2. Select **Custom Webhook** and choose a **trigger condition** (registered, attended live,
   missed live and so on).
3. Enter the webhook URL: a path appended to the base URL, or a full URL to a different endpoint.
4. Add a custom body key-value pair `event` = `registered` (or `attended_live`, `missed_live`,
   `left_early`, `purchased`) so the handler can tell rules apart, or use one URL path per rule.

Body key-value pairs can also carry authentication in WebinarJam, but the examples and
Hookdeck's WebinarJam source check a **header**, so use a header.

## Local Testing

```bash
npx hookdeck-cli listen 3000 webinarjam --path /webhooks/webinarjam
```

Use the printed URL as the base webhook URL. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/webinarjam \
  -H "Content-Type: application/json" \
  -H "Authorization: $WEBINARJAM_WEBHOOK_SECRET" \
  -d '{"event":"registered","email":"ada@example.com","first_name":"Ada"}'
```
