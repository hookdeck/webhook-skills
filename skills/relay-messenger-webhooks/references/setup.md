# Setting Up Relay Webhooks

Relay has no dashboard form for webhook URLs. You create webhook subscriptions per agent through the API.

## Prerequisites

- A Relay Agent Token for the agent (sent as `Authorization: Bearer $RELAY_AGENT_TOKEN`)
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Create a Subscription and Get Your Signing Secret

```bash
curl -sS -X POST https://api.relayapp.im/v1/webhook-subscriptions \
  -H "Authorization: Bearer $RELAY_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://webhooks.example.com/webhooks/relay-messenger",
    "subscribed_events": ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"]
  }'
```

The `201` response includes `signing_secret`, a `whsec_` prefix followed by base64-encoded key bytes. **It is
the only time Relay shows it, so store it immediately.** Put the full value, prefix included, in
`RELAY_MESSENGER_WEBHOOK_SECRET`. The response also carries `id`, `target_url`, `subscribed_events` and `is_active`.

Notes on the request:

- `target_url` must be a public HTTPS URL. Localhost, private networks, link-local and cloud metadata addresses
  get terminal attempts, and redirects are never followed.
- `subscribed_events` takes names from the event catalog (`GET /v1/webhook-events`). Any other name is rejected
  with code `1005`.
- Each event goes to every active subscription that includes its type, so one subscription per receiver is enough.
- No challenge or validation request is sent when you create a subscription, so the endpoint doesn't need a
  handshake.

## Manage Subscriptions

| Action | Endpoint |
|--------|----------|
| List | `GET /v1/webhook-subscriptions` |
| Retrieve | `GET /v1/webhook-subscriptions/{subscriptionId}` |
| Update | `PUT /v1/webhook-subscriptions/{subscriptionId}`: same fields as create plus `is_active` |
| Delete | `DELETE /v1/webhook-subscriptions/{subscriptionId}` (`204`) |
| List event types | `GET /v1/webhook-events` |

Pause delivery with `is_active: false`; the secret is kept. A lost secret cannot be read back: delete the
subscription, create a new one, and update `RELAY_MESSENGER_WEBHOOK_SECRET`. Any saved subscription, active or not,
puts the agent in webhook mode, and deleting the last one moves pending events back to WebSocket delivery.
The TypeScript SDK equivalents are `relay.webhookSubscriptions.create/list/retrieve/update/delete`.

## Register Your Endpoint (Local Development)

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 relay-messenger --path /webhooks/relay-messenger

# FastAPI
npx hookdeck-cli listen 8000 relay-messenger --path /webhooks/relay-messenger
```

No account is needed. Use the URL the CLI prints as `target_url`, then message your agent in Relay to see the
event arrive.

## Test Mode vs Live Mode

The webhook docs describe no separate test mode. Each subscription has its own signing secret, so use the
secret of the subscription that is actually delivering to the URL.

## Troubleshooting Delivery

- Relay retries `429`, `5xx`, timeouts and network errors for about 27 minutes, then gives up. Any other status,
  a `401` for a bad signature included, is terminal and loses the event.
- If attempts stop after one try, check your response code. A redirect to HTTPS is the usual cause.
- If an event never arrives, check `is_active`, the `subscribed_events` list, and that the URL is public.
- When a `message.received` delivery goes terminal, Relay sends `message.failed` to the agent that sent the message.
