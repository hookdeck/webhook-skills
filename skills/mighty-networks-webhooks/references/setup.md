# Setting Up Mighty Networks Webhooks

## Prerequisites

- A Mighty Networks Network where you can manage Network settings and API access
- A publicly reachable **HTTPS** endpoint (production webhook URLs must use HTTPS). Locally, use
  `npx hookdeck-cli listen 3000 mighty-networks --path /webhooks/mighty-networks`

## Get Your API Key

Mighty Networks has no signing secret. Instead you configure an **API key** together with the
webhook, and Mighty Networks sends it back to you as `Authorization: Bearer <API key>` on every
delivery.

1. Choose a long random value for the API key (for example `openssl rand -hex 32`).
2. Enter it as the webhook's API key in your Network settings (step below).
3. Store the **bare key** as `MIGHTY_NETWORKS_WEBHOOK_SECRET`. Don't add a `Bearer ` prefix.

## Register Your Endpoint

1. In your Network settings, open the webhook configuration.
2. Enter your endpoint URL, e.g. `https://example.com/webhooks/mighty-networks`.
3. Enter the API key from the previous step.
4. Select the events you want to receive.
5. Save. Mighty Networks sends `POST` requests with a JSON body to the URL when those events occur.

The Network-settings screens change over time, so follow the current
[webhooks documentation](https://docs.mightynetworks.com/api/webhooks) if a label differs.

## Set Up the Source in Hookdeck

Create a source of type **Mighty Networks** (`MIGHTY_NETWORKS`). Hookdeck shows this note, and it
is all you need to do:

Paste the API key you configured with the webhook in Mighty Networks.

Hookdeck checks the `Authorization` header against that key (the `Bearer ` scheme is matched in
any case), then forwards the request to your destination.

## Test

Create content that triggers a subscribed event, such as a post in a space, and check that your
endpoint logs `PostCreated`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/mighty-networks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MIGHTY_NETWORKS_WEBHOOK_SECRET" \
  -d '{"event_id":"11111111-1111-4111-8111-111111111111","event_timestamp":"2024-01-15T10:30:00Z","event_type":"PostCreatedHook","payload":{"id":1,"title":"Hello","space_id":2}}'
```

## Rotating the Key

A static key gives no replay protection and works for anyone who learns it. If it leaks, set a new
key in Mighty Networks and update `MIGHTY_NETWORKS_WEBHOOK_SECRET` (and the Hookdeck source) at
the same time.

## Network Notes

The docs don't publish source IP addresses, so use the API key rather than an IP allowlist.
