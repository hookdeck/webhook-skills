# Setting Up beehiiv Webhooks

## Prerequisites

- A beehiiv account on a paid plan (Lite and above)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 beehiiv --path /webhooks/beehiiv` during development)

## Register Your Endpoint

1. In beehiiv, go to **Settings > Webhooks**.
2. Add an endpoint with your URL (for example `https://example.com/webhooks/beehiiv`).
3. Select the events to receive, for example `subscription.created`, `subscription.upgraded`, `subscription.deleted` and `post.sent`.

## Get Your Signing Secret

1. Open the endpoint's details page under **Settings > Webhooks**.
2. Copy the signing secret. It is issued by Svix and starts with `whsec_`.
3. Set it as `BEEHIIV_WEBHOOK_SECRET`. Each endpoint has its own secret.

## Test Your Endpoint

Create a test subscriber or trigger one of the selected events, then check your handler logs. Failed deliveries can be resent from the endpoint's details page.

## Using Hookdeck

Point the beehiiv endpoint at your Hookdeck source URL. Hookdeck's `beehiiv` source type verifies the Svix signature and forwards to your app. Retries and replays keep the original `svix-timestamp`, so if your app also verifies with the `svix` library, see [verification.md](verification.md) for the 5-minute window.
