# Setting Up Stytch Webhooks

## Prerequisites

- A Stytch workspace with a project (Consumer or B2B)
- A publicly reachable HTTPS endpoint that accepts `POST` (use a tunnel for local development)

## Register Your Endpoint

1. Open the **Webhooks** page of the Stytch Dashboard.
2. Click **+ Add Endpoint** and enter your endpoint URL (e.g. `https://example.com/webhooks/stytch`).
3. Choose **all events** or filter to specific event types (e.g. `direct.user.create`, `direct.member.update`).
4. Click **Create**. You can add several endpoints for different events or environments.

## Get Your Signing Secret

Open the endpoint in the Webhooks page and copy its signing secret. It starts with `whsec_`. Store it as `STYTCH_WEBHOOK_SECRET`.

## Local Development

```bash
npx hookdeck-cli listen 3000 stytch --path /webhooks/stytch   # Express, Next.js
npx hookdeck-cli listen 8000 stytch --path /webhooks/stytch   # FastAPI
```

Use the printed tunnel URL as the endpoint URL in the Dashboard.

## Testing

Trigger an event you subscribed to (e.g. create an Organization in the Dashboard or update a Member via the API). Delivery attempts appear in the **Message Attempts** table, **Logs** tab, and **Activity** tab of the endpoint. If every attempt fails for 5 days Svix disables the endpoint: open it and select **Enable Endpoint**.
