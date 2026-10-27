# Setting Up Sohar Health Webhooks

## Prerequisites

- A Sohar Health account with **production** API credentials (webhooks are managed with them,
  even for sandbox events)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Sohar Health Webhook Endpoint?

Registration is API-managed, in two calls against `https://api.soharhealth.com`:

1. **Create Webhook**: `POST /v1/webhooks` with `{"url": "https://example.com/webhooks/sohar-health"}`.
   The response (`201`) contains an `endpointId` such as `ep_2pqPuj665SJeVw8DkU3pkZq1njL`.
2. **Create Event**: `POST /v1/webhooks/{endpointId}/events` with `{"event": "sandbox.verification.updated"}`
   subscribes the endpoint to one event type. Repeat for each event you want. The response lists
   the endpoint's `events`.

Both calls take a bearer token in the `Authorization` header (see Sohar Health's
[authentication](https://docs.soharhealth.com/api-reference/api-reference/authentication) page).
`sandbox.verification.updated` is the recommended event for testing. No challenge or validation
request is documented, so the endpoint simply starts receiving events. Respond `200 OK`.

Event names to subscribe to: `verification.updated`, `verification.pending`, `discovery.updated`,
`flow.updated`, `flow.callback`, and their `sandbox.` twins. See [overview.md](overview.md).

## Where Do I Find the Webhook Secret?

In the Svix Portal, per endpoint: open the endpoint's detail view from the
[Webhooks](https://app.soharhealth.com/webhooks) page of your dashboard, then choose
**Open Svix Portal** from the menu in the top-right corner. The docs print no secret sample, but
Sohar Health delivers through Svix, whose secrets start with `whsec_`. Store the full value,
prefix included:

```bash
SOHAR_HEALTH_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. Each endpoint has its own secret.

## Testing Locally

```bash
npx hookdeck-cli listen 3000 sohar-health --path /webhooks/sohar-health
```

Register the tunnel URL with Create Webhook, as above. For FastAPI use port `8000`. Subscribe to
`sandbox.verification.updated`, then call the Create Verification API with sandbox credentials and
Sohar Health's sandbox values to generate a delivery.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
