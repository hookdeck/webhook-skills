# Setting Up Facebook Messenger Webhooks

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) app with Messenger (the "Engage
  with customers on Messenger" use case), **published**
- A Facebook Page, and a Page access token from someone who can perform the `MODERATE` task on it
- `pages_messaging` and `pages_manage_metadata` permissions
- Access level: **Standard Access** delivers notifications only from people with a role on
  your app (admins, developers, testers); **Advanced Access** (App Review) is needed for
  everyone else
- A publicly reachable HTTPS Callback URL with a valid (not self-signed) certificate

## Get Your Signing Secret

Meta signs every payload with your app's **App Secret**: App Dashboard > **App settings >
Basic** > App Secret (click **Show**). Store it as `MESSENGER_APP_SECRET`. It is not the verify
token and not a Page access token.

## Choose a Verify Token

Any string you invent (`openssl rand -hex 20`). Store it as `MESSENGER_VERIFY_TOKEN` and enter
the same value in the Dashboard's **Verify Token** field.

## Register Your Endpoint

1. App Dashboard > **Products > Messenger > Settings** (for Instagram messaging only, use
   **Instagram settings** there instead).
2. Enter the **Callback URL** (`https://your-domain.com/webhooks/messenger`) and the Verify Token.
3. Meta sends a `GET` handshake; your endpoint must echo `hub.challenge`.
4. Subscribe to the fields you need, e.g. `messages`, `messaging_postbacks`,
   `message_reads`, `message_deliveries`, `message_reactions`, `messaging_optins`,
   `messaging_referrals`, and click **Save**.

You can also manage the app subscription with the Graph API `/app/subscriptions` endpoint.
Use the latest API version to get all fields in each payload.

## Subscribe Each Page

Connect the app to the Page (Meta Business Suite > All Tools > Business Apps), then subscribe
the Page to the fields:

```bash
curl -i -X POST "https://graph.facebook.com/<PAGE_ID>/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=<PAGE_ACCESS_TOKEN>"
# {"success": "true"}

# Check which apps the Page has installed
curl -i -X GET "https://graph.facebook.com/<PAGE_ID>/subscribed_apps?access_token=<PAGE_ACCESS_TOKEN>"
```

Every messaging app for the business must be subscribed to the messaging webhooks.

## Hookdeck Setup

Paste your Meta app's App Secret (App settings > Basic).

Hookdeck answers the `hub.challenge` handshake itself without checking the Verify Token, so
any value you enter in the Meta dashboard works. The destination doesn't need to handle the
GET. Use the Hookdeck source URL as the Callback URL. Hookdeck acknowledges Meta
quickly, which helps you stay inside Meta's 5-second response window and avoid the 1-hour
**Webhooks Disabled** unsubscribe.

For local development:

```bash
npx hookdeck-cli listen 3000 messenger --path /webhooks/messenger
```

## Testing

```bash
# Handshake
curl -X GET "localhost:3000/webhooks/messenger?hub.verify_token=YOUR-VERIFY-TOKEN&hub.challenge=CHALLENGE_ACCEPTED&hub.mode=subscribe"
```

A POST without a valid signature gets `401` from the examples, so sign test payloads with your
App Secret (see the example tests), or send a test notification from the Dashboard / message
the Page from an account with a role on the app.

If the app was unsubscribed after an outage (Webhooks Disabled alert), fix the endpoint and
subscribe the Page again.
