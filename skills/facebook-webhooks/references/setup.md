# Setting Up Facebook (Meta Graph API) Webhooks

## Prerequisites

- A [Meta for Developers](https://developers.facebook.com/) account
- A registered **App** in the App Dashboard
- A publicly reachable HTTPS **Callback URL** for your webhook endpoint
- For Page events: a Facebook Page and the `pages_manage_metadata` permission

## Get Your App Secret

The App Secret is the key used to sign webhook payloads (`X-Hub-Signature-256`).

1. Go to [App Dashboard](https://developers.facebook.com/apps/) → your app
2. **Settings → Basic**
3. Copy the **App Secret** (click **Show**)
4. Store it as `FACEBOOK_APP_SECRET` — never commit it

## Choose a Verify Token

The Verify Token is an arbitrary string **you** invent. Meta echoes it back
during the GET handshake so your server can confirm the request is one you
configured.

1. Generate a random string (e.g. `openssl rand -hex 20`)
2. Store it as `FACEBOOK_VERIFY_TOKEN` in your app
3. You will paste the **same** value into the Dashboard in the next step

## Register Your Callback URL

1. In the App Dashboard, add the **Webhooks** product
2. Pick an object to subscribe to (e.g. **Page**, **Instagram**, **User**)
3. Click **Subscribe to this object** / **Edit subscription**
4. Enter:
   - **Callback URL**: `https://your-domain.com/webhooks/facebook`
   - **Verify Token**: the same value as `FACEBOOK_VERIFY_TOKEN`
5. Click **Verify and Save**. Meta immediately sends a `GET` handshake to your
   Callback URL. Your endpoint must echo `hub.challenge` (see
   [verification.md](verification.md)). If it fails, the URL is rejected.
6. After the URL is verified, **subscribe to individual fields** (e.g. `feed`,
   `mention`, `messages` for Page; `comments`, `mentions` for Instagram).

## Subscribe a Page to Your App

Verifying the Callback URL subscribes the **app** to an object's fields. To
actually receive events for a specific **Page**, you must also subscribe that
Page to your app:

```bash
curl -X POST \
  "https://graph.facebook.com/v24.0/{page-id}/subscribed_apps" \
  -d "subscribed_fields=feed,mention,messages" \
  -d "access_token={page-access-token}"
```

This requires the `pages_manage_metadata` permission on the Page access token.

### Using the Meta Business SDK (optional)

The official Meta Business SDKs are **Graph API clients** — they help you make
calls like `subscribed_apps` above. They do **not** provide webhook signature
verification, so this skill verifies signatures manually (see
[verification.md](verification.md)).

- Node.js: [`facebook-nodejs-business-sdk`](https://www.npmjs.com/package/facebook-nodejs-business-sdk) `^24.0.1`
- Python: [`facebook-business`](https://pypi.org/project/facebook-business/) `>=25.0.3`

## Development Mode vs Live Mode

- **Development mode:** Your app only receives **test notifications** (e.g. the
  "Test" button in the Dashboard, or events from users with a role on the app).
- **Live mode:** Required to receive real events from the general public. Switch
  the app to Live in the Dashboard once your endpoint is verified and reviewed.

## Optional: Mutual TLS (mTLS)

Meta can present a client certificate with the Common Name
`client.webhooks.fbclientcerts.com`. If you enable mTLS at your edge, allow that
certificate so deliveries are not rejected.

## Testing

- Use the **Test** button next to each field in the Dashboard Webhooks UI to
  send a sample payload.
- Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to tunnel to localhost:

  ```bash
  npx hookdeck-cli listen 3000 facebook --path /webhooks/facebook
  ```

  Use the tunnel URL as your Callback URL while developing.
