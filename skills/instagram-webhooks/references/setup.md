# Setting Up Instagram Webhooks

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) **Business** app with the
  **Instagram** product
- The app published / **Live** (required to receive notifications for app users), Advanced
  Access for the fields that need it, and Business Verification for production access
- A publicly reachable HTTPS Callback URL with a valid (not self-signed) certificate
- An Instagram **professional** account (public, for comments and mentions)

## Get Your Signing Secret

Meta's Instagram webhooks guide says payloads are signed "using the payload and your app's
**App Secret**", and its sample app copies the secret from **App settings > Basic**.

Apps that use **Instagram API with Instagram Login** also have an **Instagram app secret**
(App Dashboard > Instagram > API setup with Instagram login > 3. Set up Instagram business
login > Business login settings > Instagram app secret), used for the OAuth token exchange.
**The docs don't say whether webhooks for Instagram Login apps are signed with that secret.**
Use the App Secret first; if verification fails on an Instagram Login app, try the Instagram
app secret. Store the one that works as `INSTAGRAM_APP_SECRET`.

## Choose a Verify Token

Any string you invent (`openssl rand -hex 20`). Store it as `INSTAGRAM_VERIFY_TOKEN` and
enter the same value in the Dashboard's **Verify Token** field.

## Register Your Endpoint (Callback URL and Fields)

Open Webhooks for your API setup:

- **Unified Login:** **Configure webhooks** on the **API setup with Unified login** tab.
- **Instagram Login:** **Instagram > API setup with Instagram login**, section
  **Configure webhooks** > **Configure**. New apps are subscribed by default to `comments`,
  `live_comments`, `message_reactions`, `messages`, `messaging_optins`,
  `messaging_postbacks`, `messaging_referral` and `messaging_seen`.
- **Facebook Login / Messenger Platform:** the Webhooks product (or Messenger >
  Instagram settings for Instagram messaging).

Then:

1. Enter the **Callback URL** (`https://your-domain.com/webhooks/instagram`) and the Verify Token.
2. Click verify/save. Meta sends a `GET` handshake; your endpoint must echo `hub.challenge`.
3. Select only the fields your app needs, and request only their permissions
   (see [overview.md](overview.md)).

## Enable Notifications for Each Account

Subscribing the app is not enough: subscribe each app user's account with the matching token.

```bash
# Unified Login
curl -X POST "https://graph.facebook.com/v27.0/<INSTAGRAM_ACCOUNT_ID>/subscribed_apps" \
  -d "subscribed_fields=comments,messages" \
  -d "access_token=<BUSINESS_INTEGRATION_SYSTEM_USER_ACCESS_TOKEN>"

# Instagram Login
curl -X POST "https://graph.instagram.com/v27.0/<INSTAGRAM_ACCOUNT_ID>/subscribed_apps?subscribed_fields=comments,messages&access_token=<INSTAGRAM_USER_ACCESS_TOKEN>"

# Facebook Login (subscribe the linked Page)
curl -X POST "https://graph.facebook.com/v27.0/<FACEBOOK_PAGE_ID>/subscribed_apps?subscribed_fields=comments,messages&access_token=<FACEBOOK_PAGE_ACCESS_TOKEN>"
```

Each returns `{"success": true}`. Instagram User tokens and `graph.instagram.com` don't work
with Unified Login.

## Hookdeck Setup

Paste your Meta app's App Secret (App settings > Basic). If your app uses Instagram API with
Instagram Login and verification fails, use the Instagram app secret from the Instagram
product's API setup page instead.

Hookdeck's edge answers the `hub.challenge` handshake itself, so the destination doesn't need
to handle the GET. Use the Hookdeck source URL as the Callback URL.

For local development:

```bash
npx hookdeck-cli listen 3000 instagram --path /webhooks/instagram
```

## Testing

1. In the Dashboard, use **Test** next to a field to send a sample notification.
2. Trigger a real event (for messaging, send the account a test DM).
3. Confirm the signature verifies, the endpoint returns `200` quickly, and a duplicate
   delivery doesn't repeat the action.

Optional: Meta supports mTLS for webhooks (client certificate CN
`client.webhooks.fbclientcerts.com`, signed by Meta's outbound API CA). It doesn't replace
signature verification.
