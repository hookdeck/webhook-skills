# Setting Up Papergames Webhooks

Webhook endpoints are managed in the Papergames developer tools only. There is no documented REST API for creating or listing endpoints.

## Prerequisites

- A Papergames developer account, created in the developer tools at [papergames.io/en/developers/apikeys](https://papergames.io/en/developers/apikeys) (email or social login). The docs themselves live at [developers.papergames.io](https://developers.papergames.io) — that host is documentation only, not the dashboard.
- An API key (create one per environment, e.g. dev / test / prod)
- A publicly reachable HTTPS URL for your handler (use the Hookdeck CLI below for local development)

## How Do I Create an API Key?

1. Sign in to the developer tools at [papergames.io/en/developers/apikeys](https://papergames.io/en/developers/apikeys).
2. Click **Create API Key**, and name it after its environment.

The API key is sent as the `X-Api-Key` header on calls **you make** to the Papergames REST API (for example to create game sessions). It is not used to authenticate inbound webhooks. Its only link to webhooks is that each endpoint belongs to an API key.

## How Do I Register a Webhook Endpoint?

1. In the developer tools, open **webhook management** at [papergames.io/en/developers/webhooks](https://papergames.io/en/developers/webhooks). (The Managing Webhooks docs page links there via a typo'd host, `papergmaes.io`, which does not resolve — use `papergames.io`.)
2. Click **Create endpoint** and fill in the form:
   - **url**: the public URL of your endpoint, e.g. `https://example.com/webhooks/papergames`
   - **webhook name**: a description such as `dev`, `test` or `prod`
   - **events**: the events to subscribe to: `game.started` and/or `game.finished`
3. Save. The endpoint starts receiving events straight away. There is no verification handshake or challenge; just return `2xx`.

You can have several endpoints per API key, and several API keys.

## Where Do I Get the Webhook Secret?

Right after you create the endpoint, the developer tools show its **webhook secret**, which is used to sign and verify messages. It looks like `whsec_<base64>`. Copy it then and store it securely:

```bash
PAPERGAMES_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Store the whole value, prefix included. The handlers strip `whsec_` and base64-decode the rest to get the HMAC key. Each endpoint has its own secret.

## What Can I See in the Dashboard?

For each endpoint the developer tools show:

- delivery rate, URL and subscribed events
- **view logs**: dispatched events with status and timestamp, and the payload and HTTP status code of each attempt
- **disable** and **delete** actions (delivery stops for disabled or deleted endpoints)

## How Do I Test Locally?

Run the Hookdeck CLI to get a public URL that forwards to your machine (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 papergames --path /webhooks/papergames

# FastAPI
npx hookdeck-cli listen 8000 papergames --path /webhooks/papergames
```

Register the printed URL as the endpoint URL, then create a game session and play a game in its `playUrl` to trigger `game.started` and `game.finished`.

The Papergames debugging page also points to [Svix Play](https://www.svix.com/play/), Svix's free webhook playground, where you can inspect deliveries without running a server.

## Is There an IP Allowlist?

Papergames doesn't publish source IP ranges. Authenticate deliveries with the signature instead.

## Docs

- [Managing webhooks](https://developers.papergames.io/docs/webhooks/managing-webhooks)
- [Getting started](https://developers.papergames.io/docs/getting-started)
- [Debugging](https://developers.papergames.io/docs/webhooks/debugging)
