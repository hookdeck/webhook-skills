# Setting Up Threads Webhooks

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) app with the Threads API use case
- A publicly reachable HTTPS Callback URL
- Users who have granted the app the permissions for the fields you subscribe to
  (`threads_basic`, plus `threads_read_replies`, `threads_delete` or `threads_manage_mentions`)

## Add the Webhooks Sub-Use Case

1. App Dashboard > **Use Cases** > **Customize** > **Settings**
2. Add **Get real-time notifications with Threads Webhooks**

## Get Your Signing Secret

Meta signs every notification with an app secret, but **the Threads webhooks page does not
say which one**:

- Meta's getting-started guide says the **App Secret** (App Dashboard > Settings > Basic).
- Threads apps also show a separate **Threads App Secret** (Use cases > Threads API > Settings).

Use the secret of the app the webhook is configured on, and if verification fails, try the
other one. Store it as `THREADS_APP_SECRET`.

## Choose a Verify Token

An arbitrary string you invent (`openssl rand -hex 20`). Store it as `THREADS_VERIFY_TOKEN`
and enter the same value next to the Callback URL.

## Register Your Endpoint

1. Select the topic and click **Subscribe to this object**
2. Enter the **Callback URL** (`https://your-domain.com/webhooks/threads`) and the verify token
3. Meta sends a `GET` handshake; your endpoint must echo `hub.challenge`
4. Subscribe to the fields: `replies`, `mentions`, `publish`, `delete`

## Hookdeck Setup

Paste the app secret your Threads app signs webhooks with into the Threads source's
verification settings. Hookdeck's edge answers the `hub.challenge` handshake itself, so you
don't need to handle the GET in the destination.

For local development:

```bash
npx hookdeck-cli listen 3000 threads --path /webhooks/threads
```

## Test Mode vs Live Mode

Non-tech-provider apps must be in **Live Mode** to receive live notifications; tech providers
need **Advanced Access** on the permissions. The Threads docs also offer a sample app for
testing the integration.
