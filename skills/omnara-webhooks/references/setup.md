# Setting Up Omnara Webhooks

## Prerequisites

- An Omnara project, and project management permission to create webhooks
- A public HTTPS endpoint for your handler (use the Hookdeck CLI while developing)

## Signing Is Opt-In

Omnara only signs deliveries when the subscription has a signing secret (`signing_secret_id`).
Unsigned deliveries carry `Webhook-Id` and `Webhook-Timestamp` but no `Webhook-Signature`, so
they can't be verified.

## Create the Signing Secret

1. Generate a value: `openssl rand -base64 32` (bare base64, no `whsec_`).
2. Store it in Omnara as a project-available [generic secret](https://docs.omnara.com/organization/secrets.md).
3. Put the same value in your receiver's `OMNARA_WEBHOOK_SECRET`. The `standardwebhooks`
   library accepts it bare or with a `whsec_` prefix. In a Hookdeck Omnara source, enter it as
   `whsec_` followed by the secret.

## Create the Subscription

Open the project's **Webhooks** tab and set the destination URL, the event types, the signing
secret and **Receive events from** (all agents in the project, agents using one profile, or one
agent). Or use the API:

```bash
curl -X POST "$OMNARA_API/orgs/$ORG/projects/$PROJ/event-webhooks" \
  -H "Authorization: Bearer $OMNARA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": {
      "type": "profile",
      "agent_profile_id": "aprf_5n6a2bfgik7mv4qtrwz3jehcyd"
    },
    "url": "https://example.com/events",
    "event_types": ["tool_call_update"]
  }'
```

The body is Omnara's documented example. Add `"signing_secret_id"` with your generic secret's
`sec_` ID to sign deliveries.

- `event_types` is required and nonempty: `agent_input`, `model_output`, `tool_result`,
  `context_checkpoint`, `tool_call_update`.
- `signing_secret_id` is optional but needed for verification. Set it to `null` with
  `PATCH .../event-webhooks/{webhookID}` to remove signing.
- `scope` is `project`, `profile` (with `agent_profile_id`) or `agent` (with `agent_id`).
  Project selections include all existing and future agents and their subagents; an agent
  selection watches only that agent, not its descendants.
- A project can have 100 active subscriptions, and each selection one per URL (`409` otherwise).
- Changes apply to newly queued notifications, with no historical replay. URL and signing
  changes also apply to pending attempts.

## Test

There is no challenge or test endpoint. Run an agent with a selected event type and watch
the delivery arrive (locally with `npx hookdeck-cli listen 3000 omnara --path /webhooks/omnara`).
Return `2xx` within five seconds.
