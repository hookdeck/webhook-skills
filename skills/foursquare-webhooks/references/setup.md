# Setting Up Foursquare Webhooks

## Prerequisites

- A Foursquare Developer Console project with the Movement SDK (Pilgrim) enabled
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Pilgrim Secret

1. Open the Foursquare Developer Console and select your project.
2. Go to the **Pilgrim** page. It shows the secret Foursquare sends on every webhook request.
3. Store it as `FOURSQUARE_PILGRIM_SECRET`.

Foursquare sends this value as-is in the `Pilgrim-Secret` header, with no prefix
and no hashing.

## Register Your Endpoint

1. On the Developer Console **Home** page, select the project.
2. On the project **Settings** page, click **Webhooks** under the Movement SDK section.
3. On the Movement SDK Webhook page, enter the server URL that should receive the `POST` requests.
4. Click **Save**.

Foursquare then sends a `POST` for each arrival, departure, and geofence event.
There is no per-event subscription step in the documentation.

## Local Development

```bash
npx hookdeck-cli listen 3000 foursquare --path /webhooks/foursquare
```

Use the Hookdeck URL as the server URL in the Developer Console. For FastAPI,
use port `8000`.

## Notes

- Webhooks fire in addition to the SDK's in-app callback; they don't replace it.
- Treat any request without a matching `Pilgrim-Secret` as unauthenticated.
- Geofence properties come from the Pilgrim SDK configuration in the Developer Console.
