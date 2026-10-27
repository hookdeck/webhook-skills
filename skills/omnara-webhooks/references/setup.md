# Setting Up Omnara Webhooks

## Prerequisites

- An Omnara project with an agent config
- A public HTTPS endpoint for your handler (use the Hookdeck CLI while developing)

## Signing Is Opt-In

Omnara only signs deliveries when the agent config sets `event_webhook.signing_secret_id`.
Hookdeck's configuration alert for this source reads exactly:

> "Signing is opt-in per agent: set event_webhook.signing_secret_id, then paste that secret here as whsec_ followed by the secret. Unsigned deliveries fail verification."

Unsigned deliveries carry `Webhook-Id` and `Webhook-Timestamp` but no `Webhook-Signature`, so
they can't be verified.

## Create the Signing Secret

1. Generate a value: `openssl rand -base64 32` (bare base64, no `whsec_`).
2. Store it in Omnara as a project-available [generic secret](https://docs.omnara.com/organization/secrets.md).
3. Put the same value in your receiver's `OMNARA_WEBHOOK_SECRET`. The `standardwebhooks`
   library accepts it bare or with a `whsec_` prefix. In Hookdeck, paste it as `whsec_`
   followed by the secret.

## Configure the Event Webhook

In the agent config:

```yaml
event_webhook:
  url: https://example.com/webhooks/omnara
  events: [agent_input, model_output, tool_result, context_checkpoint, tool_call_update]
  signing_secret_id: sec_xxxxxxxx   # the generic secret from the previous step
```

- `url` must be public HTTPS.
- `events` is required and nonempty. Supported types: `agent_input`, `model_output`,
  `tool_result`, `context_checkpoint`, `tool_call_update`. The builder defaults to tool-call updates.
- `signing_secret_id` is optional but needed for verification.
- Changes apply to newly queued events. Self-subagents inherit this configuration.

## Test

There is no challenge or test endpoint. Run an agent with a selected event type and watch
the delivery arrive (locally with `npx hookdeck-cli listen 3000 omnara --path /webhooks/omnara`).
Return `2xx` within five seconds.
