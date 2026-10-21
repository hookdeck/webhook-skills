# Setting Up AppsFlyer Push API Webhooks

Docs: [Push API (streaming raw data)](https://support.appsflyer.com/hc/en-us/articles/207034356-Push-API-streaming-raw-data)

## Prerequisites

- An AppsFlyer account with permission to manage Push API for the app
- A publicly reachable **HTTPS** endpoint that accepts POST requests (for local
  development, see [Local development](#local-development))

## Choose Your Authorization Header

AppsFlyer doesn't generate a secret. You choose a header name and a token:

1. Generate a long random token, e.g. `openssl rand -hex 32`.
2. Store it as `APPSFLYER_AUTH_TOKEN`.
3. If you use a header name other than `Authorization`, store it as
   `APPSFLYER_AUTH_HEADER_NAME`.

The header is configured **per app ID**.

## Register Your Endpoint

1. In AppsFlyer, open the Push API configuration for your app.
2. Enter your endpoint URL.
3. Choose the **POST** method.
4. Add the custom authorization header: the name and the token value from above.
5. Select the event types and fields to stream.

The exact menu path in the dashboard changes over time; follow the linked doc.

## Local Development

```bash
npx hookdeck-cli listen 3000 appsflyer --path /webhooks/appsflyer
```

Paste the printed HTTPS URL as the endpoint. Use port `8000` for FastAPI.

## Test Mode vs Live Mode

Push API streams real attribution data for the app. Use a test device or a
non-production app ID to generate an `install` without touching production data.
