# Setting Up Taskrabbit Webhooks

## Prerequisites

- Taskrabbit Partner API access (webhooks are available after partner onboarding)
- Access to the **Svix Partner Dashboard** Taskrabbit provides during onboarding
- A publicly reachable HTTPS endpoint, or a local tunnel (see below)

There is no self-serve webhook settings page in a Taskrabbit account, and no API
for creating subscriptions. Endpoints are managed in the Svix Partner Dashboard.
If you don't have dashboard access, ask your Taskrabbit partner contact.

## Register Your Endpoint

1. Open the Svix Partner Dashboard.
2. Click **Add Endpoint**.
3. Enter your URL, e.g. `https://your-app.com/webhooks/taskrabbit`.
4. Subscribe to the events you need: `project.completed`, `project.canceled`,
   `project.rescheduled`.
5. Save the endpoint.

## Get Your Signing Secret

1. Open the endpoint you created.
2. Reveal and copy the **Signing Secret**. Svix secrets start with `whsec_`.
   Taskrabbit's docs don't show an example value; the format comes from Svix.
3. Store it as an environment variable:

   ```bash
   TASKRABBIT_WEBHOOK_SECRET=whsec_xxxxx
   ```

Each endpoint has its own secret. If you register separate endpoints (for
example staging and production), store a secret per environment.

## Secret Rotation

Svix lets you rotate an endpoint's secret. For a period afterwards, messages are
signed with both the old and new secrets, so `svix-signature` carries several
`v1,<sig>` entries. The `svix` SDK accepts the message if any entry matches.

## Local Development

Use the Hookdeck CLI to get a public URL for your local server (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 taskrabbit --path /webhooks/taskrabbit

# FastAPI
npx hookdeck-cli listen 8000 taskrabbit --path /webhooks/taskrabbit
```

Add the printed URL as an endpoint in the Svix Partner Dashboard, then send an
example event from the endpoint's testing tab, or replay a past message.

## Monitoring Deliveries

The Svix Partner Dashboard shows each message, its delivery attempts and the
response your endpoint returned. Use it to replay failed messages after a fix.
