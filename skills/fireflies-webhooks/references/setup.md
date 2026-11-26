# Setting Up Fireflies Webhooks

This covers **Webhooks V2**, the current scheme. V1 is deprecated and new V1
webhooks can no longer be saved. The [legacy V1 notes](#legacy-webhooks-v1-setup)
are at the end for existing integrations.

## Prerequisites

- A Fireflies.ai account with access to the Webhooks V2 configuration page (an
  API key is also required to call the GraphQL API when you fetch transcripts).
- Your application's webhook endpoint URL — **HTTPS is required**, it must
  resolve to a public host, and redirects are not followed.
- The endpoint must accept `POST` and return a `2xx` within 30 seconds.

## Create the Webhook (V2)

1. Open the [Webhooks V2 configuration page](https://app.fireflies.ai/integrations/api/webhook).
2. Enter your **HTTPS endpoint URL** (e.g. `https://your-app.com/webhooks/fireflies`).
3. Optionally add a **Signing Secret** (see below — strongly recommended).
4. Under **Event Subscriptions**, select the events you want delivered. Only
   subscribed events are sent.
5. Optionally turn on **Resend when a meeting's notes change** to receive
   `meeting.transcribed` and `meeting.summarized` again, with `reprocessed_at`,
   when a meeting's transcript or summary changes.
6. Save, then click **Send Test Event**.

### Selecting Events

V2 delivers three events, and you subscribe per webhook:

| `event` value | Triggered When |
|---------------|----------------|
| `meeting.transcribed` | A meeting has been processed and the transcript is ready |
| `meeting.summarized` | The AI summary for the meeting has been generated |
| `meeting.bot_joined` | The Fireflies notetaker bot joined a meeting |

Subscribe only to what you handle — it keeps the traffic down and makes an
unexpected event a real signal. Still branch defensively on `event` in your
handler so a future event type does not break existing behaviour.

### The Signing Secret Is Optional

Fireflies treats the signing secret as optional at setup. This matters:

> **If you do not set a signing secret, Fireflies sends no `X-Hub-Signature`
> header at all** — the docs say the header is sent "only if a signing secret is
> configured". Your endpoint then has no way to prove a request came from
> Fireflies.

Set one in production. The docs set no length or format rule, so use a long
random string:

```bash
# 32 hex characters
openssl rand -hex 16
```

Copy the secret into your application as `FIREFLIES_WEBHOOK_SECRET`. Then decide
how your handler treats unsigned deliveries — see
[verification.md](verification.md#handling-unsigned-deliveries). The examples in
this skill warn loudly and accept when no secret is configured, and reject
unsigned or mis-signed deliveries whenever a secret *is* configured.

## Per-Upload Webhook (GraphQL)

When you upload audio programmatically, you can specify a webhook URL for that
upload's events via the `uploadAudio` mutation:

```graphql
mutation UploadAudio($input: AudioUploadInput!) {
  uploadAudio(input: $input) {
    success
    title
    message
  }
}
```

```json
{
  "input": {
    "url": "https://example.com/meeting-recording.mp3",
    "title": "Q3 Planning Call",
    "webhook": "https://your-app.com/webhooks/fireflies",
    "client_reference_id": "be582c46-4ac9-4565-9ba6-6ab4264496a8"
  }
}
```

The per-upload `webhook` URL still delivers the **legacy V1 payload shape**
(`meetingId`, `eventType`, `clientReferenceId`) for that single upload, and it
is independent of your saved V2 webhook. If you also have a V2 webhook, the
same upload's meeting arrives there in the V2 shape, with your reference as
`client_reference_id`, so handlers that receive both should branch on which
fields are present.

## Test Your Endpoint

1. Point the webhook URL at a public tunnel during development (see below).
2. Click **Send Test Event** on the Webhooks V2 page, or record/upload a short meeting.
3. Confirm the request arrives, the signature verifies, and you return a `2xx`
   quickly.

Fireflies says the test event confirms your endpoint "is reachable and
validating payloads correctly". The test body itself is not documented.

## Local Development

For local webhook testing, use the Hookdeck CLI — no install or account required:

```bash
npx hookdeck-cli listen 3000 fireflies --path /webhooks/fireflies
```

Use the URL the CLI prints as your **webhook URL** on the Webhooks V2 page. The
CLI tunnels requests to your local server and gives you a web UI for inspecting
and replaying deliveries — useful for re-running a failed verification against
the exact original bytes.

## Environment Variables

```bash
# .env
FIREFLIES_WEBHOOK_SECRET=your_signing_secret
```

## Legacy: Webhooks V1 Setup

Only relevant for integrations already on V1. New V1 webhooks can no longer
be saved: the webhook field in **Settings → Developer settings** is read-only.

- Review an existing V1 webhook, and its secret, under **Settings → Developer
  settings → Webhook → View Configuration**, where you can also disable it.
- To move, follow Fireflies' migration steps: enter the same URL (and secret,
  if you used one) on the Webhooks V2 page, subscribe to `meeting.transcribed`
  for the V1 behaviour, and update your handler for the V2 payload.

V1 has no event selection — it emits a single event type. Its payload uses
camelCase (`meetingId`, `eventType`, `clientReferenceId`).

## Full Documentation

- [Fireflies Webhooks V2](https://docs.fireflies.ai/graphql-api/webhooks-v2) — current scheme
- [Fireflies Webhooks (V1)](https://docs.fireflies.ai/graphql-api/webhooks) — legacy scheme
