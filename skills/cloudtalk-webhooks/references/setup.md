# Setting Up CloudTalk Webhooks

## Prerequisites

- A CloudTalk account on the **Essential** plan or higher
- The **Admin** role. Without it, **Webhooks** doesn't appear in the Dashboard
- A publicly reachable **HTTPS** endpoint. For local development, use the Hookdeck CLI tunnel below

## Step 1: Expose Your Local Endpoint

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 cloudtalk --path /webhooks/cloudtalk

# FastAPI
npx hookdeck-cli listen 8000 cloudtalk --path /webhooks/cloudtalk
```

No account required. The CLI prints a public URL that forwards to `/webhooks/cloudtalk` on your machine, plus a web UI for inspecting requests.

## Step 2: Add the Endpoint

1. In the CloudTalk Dashboard go to **Settings → Webhooks** and click **Add endpoint**.
2. Enter the **HTTPS URL**, e.g. `https://<your-hookdeck-url>/webhooks/cloudtalk`, and optionally a description.
3. Choose the **event types** to subscribe to. Leave the selection empty to receive every event type, including ones added in the future.

Endpoints can also be managed from the API: see [Manage webhooks with the API](https://help.cloudtalk.io/guides/webhooks/manage-with-api).

## Step 3: Get the Signing Secret

Open the new endpoint under **Settings → Webhooks** and reveal its **signing secret**. It starts with `whsec_`, for example `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`. Store it as `CLOUDTALK_WEBHOOK_SECRET`.

Each endpoint has its own secret. To rotate it, click **Rotate secret**. During rotation deliveries are signed with both the old and new secret, so `svix-signature` carries two signatures and a correct verifier keeps working.

## Step 4: Send a Test Event

Click **Send test event**, pick an event type, and confirm your endpoint returns a `2xx`. The attempt, and every real delivery after it, appears in the endpoint's **delivery log**.

## Operating the Endpoint

- **Resend** redelivers a single event from the log.
- **Recover** replays every failed delivery since a time you choose.
- **Disable / re-enable** pauses the endpoint.
- Payloads are kept for 30 days.
- An endpoint failing continuously for about 5 days is disabled automatically. Admins get an email, and for the next 12 hours CloudTalk probes it and re-enables it (replaying missed deliveries) once it returns a `2xx`.

## Features That Are Not Configured Here

The Call Flow Designer **Webhook** step, an AI Voice Agent's **Send via Webhook** option and Workflow Automation actions are set up on their own screens. They are not signed with the Svix scheme, so they need different handling from the account-level endpoint above.
