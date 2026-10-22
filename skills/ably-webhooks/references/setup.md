# Setting Up Ably Webhooks

## Prerequisites

- An Ably account and app
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 ably --path /webhooks/ably` during development)

## Create the Integration Rule

1. Open your app's **Integrations** page in the Ably dashboard.
2. Click **New Integration Rule**, choose **Webhook**, then **Webhook** again.
3. Configure:
   - **URL**: your HTTPS endpoint.
   - **Headers** (optional): extra `key:value` headers, one per line.
   - **Request Mode**: **Single request** or **Batch request**.
   - **Event types**: `channel.message`, `channel.presence`, `channel.lifecycle`, `channel.occupancy`.
   - **Channel filter**: a regular expression, for example `^public.*`.
   - **Encoding**: JSON or MsgPack.
   - **Sign with key**: select an API key (see below).
   - **Enveloped**: on by default; recommended.
4. Click **Create**.

You can also create the rule with the Control API (`POST https://control.ably.net/v1/apps/{APP_ID}/rules`) or the Ably CLI (`ably integrations create`).

## Get Your Signing Key

Signing is opt-in. Enable **Sign with key** and pick one of your app's API keys. Copy that key from **API Keys** in the dashboard; it looks like:

```
appId.keyId:keyValue
```

Store it as `ABLY_API_KEY`. **Only `keyValue` (after the `:`) is the HMAC key**; the examples split it for you. If the signing key is later removed or revoked, Ably stops delivering for the rule instead of sending unsigned requests.

## Test

Use the **Test rule** button on the rule in the dashboard, or publish a message to a matching channel.

## Test Mode vs Live Mode

Ably has no separate test mode. Use a separate app (for example a sandbox app) and a rule per environment.
