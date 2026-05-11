# Setting Up HubSpot Webhooks

## Prerequisites

- A HubSpot developer account at [app.hubspot.com/developer](https://app.hubspot.com/developer/)
- A **HubSpot app** (public or private) — webhooks are configured per app, not per portal
- Your application's webhook endpoint URL (must be HTTPS)

## Get Your Signing Secret

The webhook signing key is your app's **Client Secret** (Application Secret):

1. Go to [HubSpot Developer Account](https://app.hubspot.com/developer/)
2. Open **Apps** and select the app you want to receive webhooks for
3. On the **Auth** tab, copy the **Client secret**
4. Store it as `HUBSPOT_CLIENT_SECRET` in your environment

> Do not use a Private App access token — that is for API calls, not webhook signature verification.

## Register Your Endpoint

1. In your app, open the **Webhooks** tab
2. Set the **Target URL** to your webhook endpoint (e.g., `https://your-app.example.com/webhooks/hubspot`)
3. Click **Create subscription** and choose an object type and event
4. Activate the subscription

Common subscriptions to start with:
- `contact.creation`
- `contact.propertyChange` (select specific properties)
- `deal.creation`
- `deal.propertyChange`

## Test vs Production

HubSpot does not have a separate test mode for webhooks. You can:

- Trigger events from a **HubSpot developer test account** to your dev endpoint
- Use the **"Send test"** button on each subscription in the app dashboard (sends a synthetic payload to your URL)

For local testing, expose your local server with Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 hubspot --path /webhooks/hubspot
```

Paste the printed Hookdeck URL into the **Target URL** field of your HubSpot app while developing.

## Rate Limits and Throttling

HubSpot batches events and applies per-portal throttling. If your endpoint times out or returns non-2xx responses, HubSpot will retry with backoff for up to 24 hours. Return `200` (or any 2xx) as quickly as possible and process events asynchronously if needed.

## Headers HubSpot Sends

| Header | Purpose |
|--------|---------|
| `X-HubSpot-Signature-v3` | HMAC-SHA256 signature (base64) |
| `X-HubSpot-Request-Timestamp` | Millisecond Unix timestamp (signed content) |
| `Content-Type` | `application/json` |

Reject any request where `X-HubSpot-Request-Timestamp` is older than 5 minutes — that is HubSpot's published replay window.

## Environment Variables

```bash
# .env
HUBSPOT_CLIENT_SECRET=your_app_client_secret
```

## Full Documentation

- [HubSpot Webhooks API](https://developers.hubspot.com/docs/api/webhooks)
- [Validating Webhook Requests](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests)
