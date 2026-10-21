# Setting Up Drata Webhooks

## Prerequisites

- A Drata account with the **Admin** or **Workspace Manager** role
- Access to **Settings → Workflows**
- Your application's public HTTPS endpoint (use the Hookdeck CLI while developing)

## Generate a Shared Secret

Drata doesn't give you a signing secret, so create one:

```bash
openssl rand -hex 32
```

Store it as `DRATA_WEBHOOK_SECRET` in your app. Use a value without spaces.

## Register Your Endpoint

1. Go to **Settings → Workflows → Create Workflow**.
2. Name the workflow and choose the target object type: **Control**, **Risk**,
   **Evidence** or **Personnel**. For Control and Evidence, pick the workspace.
3. Choose which controls to monitor (all controls, or selected ones).
4. Choose a **trigger**, for example *Evidence linked* or *Mapped test failing*.
5. Add a step: **Send webhook**.
6. Paste your endpoint URL (for example `https://example.com/webhooks/drata`).
7. Add **authentication as a custom header**: name `X-Webhook-Secret`, value
   your secret. Any other header name works if you set `DRATA_WEBHOOK_HEADER`.
8. Choose the control and trigger properties to include in the body. Include
   `control_id` (used by the example dedupe key).
9. **Publish** the workflow, or save it as a draft.

Each workflow has one trigger. To receive several events, create one workflow
per trigger and point them at the same endpoint. The body's `event_type` tells
you which one fired.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 drata --path /webhooks/drata
```

Paste the URL the CLI prints into the Send webhook step. For FastAPI use port
`8000`.

## Testing

Trigger the workflow from Drata, for example by linking evidence to a control
the workflow covers. Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/drata \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $DRATA_WEBHOOK_SECRET" \
  -d '{"event_type":"CONTROL_EVIDENCE_LINKED","timestamp":"2026-10-21T09:30:00.000Z","control_id":42,"control_code":"DCF-101","evidence_name":"Q3 access review"}'
```

## Using Hookdeck in Production

Point the Send webhook step at a Hookdeck Event Gateway source URL and set the
source's authentication to a custom header (API key) with the same header name
and value. Hookdeck rejects requests without it, queues deliveries, retries to
your app, and lets you replay. See the
[hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway)
skill.

## Test Mode vs Live Mode

Drata has no separate test mode for workflows. Save the workflow as a draft
while you build it, then publish it and trigger it on a non-production
workspace first.
