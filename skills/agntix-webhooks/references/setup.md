# Setting Up Agntix Webhooks

## Prerequisites

- An Agntix account with access to the dashboard's **Developer** section.
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work).

## How Do I Register an Agntix Webhook Endpoint?

1. In the Agntix dashboard left nav, open **Developer** (under *Integrations*).
2. Click **+ Add Endpoint** in the top-right. Fill in:
   - **Endpoint URL** (required): your receiver, e.g. `https://hooks.acme.com/agntix`.
   - **Description**: a free-form label, e.g. "Production call events".
   - **Rate Limit**: a requests-per-second cap. Set it comfortably above peak (for example `50`
     for a burst of 10 concurrent calls).
   - **Subscribe to events** (required): tick `session.created` and/or `session.ended`.
3. Save. No challenge or validation request is documented, so there is no handshake to answer.

## Where Do I Find the Signing Secret?

Each endpoint has its own signing secret in the Developer section (Svix). Store the full value
separately from your code, in a secret manager:

```bash
AGNTIX_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Agntix doesn't print the secret's form in its docs, but Svix secrets start with `whsec_`. If the
value doesn't, the examples reject it with a 500 instead of verifying with the wrong key.

## Which Events Should I Subscribe To?

Only `session.created` and `session.ended` are delivered today. Other events in Agntix's event
reference are marked planned and are not emitted to webhook endpoints yet, so don't build on them.

## How Do I Correlate a Webhook With My Own Record?

Pass a unique identifier in `session_variables` when you trigger the call or chat. Agntix echoes
the keys back verbatim under `metadata.sessionVariables` on every webhook, whether or not the agent
prompt referenced them:

```json
"session_variables": { "crmContactId": "CRM-7728", "campaignId": "CAMP-2026-05-13-001", "taskId": "TASK-9911" }
```

## Retries and Replays Behind Hookdeck

Non-`2xx` responses are retried with exponential backoff for up to 24 hours. If you verify behind
Hookdeck, note that retries and replays resend the original timestamp, which the `svix` library
rejects after 5 minutes. See [verification.md](verification.md).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | The endpoint isn't subscribed to the event, or the URL isn't a reachable public HTTPS URL |
| Expected `session.updated` never arrives | It is planned, not delivered as a webhook yet |
| 500 "Server configuration error" | `AGNTIX_WEBHOOK_SECRET` is unset or doesn't start with `whsec_` |
