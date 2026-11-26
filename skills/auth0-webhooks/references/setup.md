# Setting Up Auth0 Webhooks (Event Streams)

## Prerequisites

- An Auth0 tenant.
- A public **HTTPS** endpoint for your handler, such as
  `https://your-app.com/webhooks/auth0`. Auth0 rejects a webhook endpoint that
  doesn't start with `https://`. For local development, use a tunnel (see
  [Local Development](#local-development)).

## Choose Your Token

There's no Auth0-issued secret. You generate a token and set it on the stream:

```bash
openssl rand -hex 32
```

Store it in your app as `AUTH0_EVENT_STREAM_TOKEN`.

## Create the Event Stream

### Dashboard

1. Go to **Auth0 Dashboard > Event Streams (Early)**.
2. Select **+Create Event Stream**, then **Webhook**.
3. Enter a **Stream Name** and the **Endpoint** URL.
4. Choose **Bearer Token** as the **Authentication Method** and paste your token
   as the **Authorization Token**.
5. Under **Select Event Types**, choose the events you handle.
6. Select **Save Changes**. New event streams are enabled by default.

### Auth0 CLI

```bash
auth0 events create -n my-stream -t webhook -s "user.created" \
  -c '{"webhook_endpoint":"https://your-app.com/webhooks/auth0","webhook_authorization":{"method":"bearer","token":"YOUR_TOKEN"}}'
```

The Management API (`POST /api/v2/event-streams`, with the
`create:event_streams` scope) and the Terraform `auth0_event_stream` resource
take the same `webhook_endpoint` and `webhook_authorization` settings.

## Test the Stream

Create a test user (`auth0 users create`) to trigger `user.created`. Auth0 does
not send events to a disabled stream.

## Monitor and Recover

- List failed deliveries with `GET /api/v2/event-streams/{id}/deliveries`. Auth0
  suggests polling every 5 minutes.
- Retry one failed event with `POST /api/v2/event-streams/{id}/redeliver/{event_id}`,
  or all of them with `POST /api/v2/event-streams/{id}/redeliver`.
- Auth0 disables a stream after 500 consecutive failures or 5000 total failures.
  After that, use the Redelivery API to process failed events and re-enable the
  stream through the API once failures drop below 5000.

## Local Development

Use the Hookdeck CLI to receive events on your machine, with no account and no
install (`npx` fetches it):

```bash
npx hookdeck-cli listen 3000 auth0 --path /webhooks/auth0
```

Use the printed URL as the stream's webhook endpoint. Requests are forwarded to
`http://localhost:3000/webhooks/auth0` and shown in the Hookdeck web UI for
inspection and replay.
