# Setting Up Zoom Webhooks

## Prerequisites

- A Zoom account with permission to create/manage apps in the
  [Zoom App Marketplace](https://marketplace.zoom.us/)
- Your application's public webhook endpoint URL (e.g.
  `https://your-app.com/webhooks/zoom`). For local development, use the
  Hookdeck CLI tunnel (see below).

## Create an App and Enable Event Subscriptions

1. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/) and sign in.
2. Click **Develop → Build App** and create (or open) a **General App** (or a
   Server-to-Server OAuth app, depending on your use case).
3. In the app configuration, open the **Feature** tab and enable
   **Event Subscriptions**.
4. Add a new event subscription and set the **Event notification endpoint URL**
   to your endpoint (e.g. `https://your-app.com/webhooks/zoom`).
5. Click **Add Events** and select the events you want to receive, for example:
   - `Meeting → Start Meeting` (`meeting.started`)
   - `Meeting → End Meeting` (`meeting.ended`)
   - `Meeting → Participant/Host joined meeting` (`meeting.participant_joined`)
   - `Meeting → Participant/Host left meeting` (`meeting.participant_left`)
   - `Recording → All Recordings have completed` (`recording.completed`)
6. Save the subscription.

## Get Your Secret Token

1. On the app's **Feature** tab (the Event Subscriptions section), find the
   **Secret Token**.
2. Copy it into your environment as `ZOOM_WEBHOOK_SECRET_TOKEN`.

The Secret Token is the HMAC key used both to verify the `x-zm-signature`
header and to compute the `encryptedToken` in the URL validation handshake.
Keep it secret and rotate it if it leaks.

## Validate Your Endpoint

When you save the endpoint URL (or click **Validate**), Zoom sends a one-time
`endpoint.url_validation` event. Your endpoint must respond within **3 seconds**
with:

```json
{
  "plainToken": "<plainToken from the request>",
  "encryptedToken": "<HMAC-SHA256(plainToken, secretToken) hex>"
}
```

The example handlers in this skill implement this handshake automatically. If
validation fails, Zoom will not enable the subscription — double check that the
route is public and that `ZOOM_WEBHOOK_SECRET_TOKEN` matches the app's Secret
Token.

## Local Development

Use the Hookdeck CLI to receive Zoom webhooks on your local machine — no account
required, one paste-and-run line:

```bash
npx hookdeck-cli listen 3000 zoom --path /webhooks/zoom
```

The CLI prints a public URL. Use that URL (with the `/webhooks/zoom` path) as
the **Event notification endpoint URL** in the Zoom App Marketplace. Zoom's
validation request and all subsequent events will be forwarded to your local
server.

## Testing Events

- Start or end a Zoom meeting to fire `meeting.started` / `meeting.ended`.
- Join/leave a meeting to fire `meeting.participant_joined` /
  `meeting.participant_left`.
- Record a meeting to the cloud to fire `recording.completed`.
- Re-saving the endpoint URL re-triggers the `endpoint.url_validation`
  handshake.
