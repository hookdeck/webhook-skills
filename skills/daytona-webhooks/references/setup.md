# Setting Up Daytona Webhooks

## Prerequisites

- A Daytona organization with Webhooks enabled (if you don't see **Webhooks** in the Dashboard sidebar, contact support@daytona.io)
- A public HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Open the [Daytona Dashboard](https://app.daytona.io) and click **Webhooks** in the sidebar.
2. On the **Endpoints** tab, click **Add Endpoint**.
3. Fill in:
   - **Endpoint name**: any label
   - **Endpoint URL**: your HTTPS URL, e.g. `https://example.com/webhooks/daytona`
   - **Events**: pick the events to subscribe to (see [overview.md](overview.md)), or select all
4. Click **Create**.

Edit or delete an endpoint from the three-dots menu (⋮) on the endpoint's row.

## Get Your Signing Secret

Daytona's public docs don't describe the signing secret. Deliveries go through Svix, so the secret is the Svix endpoint secret, a string starting with `whsec_`. Open the endpoint's details page in the Dashboard and look for the signing secret there. If you can't find it, ask Daytona support.

Store it as `DAYTONA_WEBHOOK_SECRET`. Never commit it.

## Inspect Deliveries

The **Messages** tab lists each message (ID, event type, timestamp, payload) and its delivery attempts (status, status code, duration, response body). Use it to see why an endpoint is failing.

## Local Development

```bash
npx hookdeck-cli listen 3000 daytona --path /webhooks/daytona
```

Use the URL the CLI prints as your **Endpoint URL**. Use port `8000` for FastAPI.

## Test It

Create a sandbox, snapshot or volume in your organization (or change a sandbox's state) and confirm the message appears in the **Messages** tab and reaches your handler.
