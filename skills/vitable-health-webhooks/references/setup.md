# Setting Up Vitable Health Webhooks

## Prerequisites

- A Vitable Health integration (employer or partner account)
- Your application's public HTTPS webhook endpoint URL (use `npx hookdeck-cli listen 3000 vitable-health --path /webhooks/vitable-health` for local development)

## Get Your Signing Secret

Vitable's documentation says: "To get your webhook secret key, reach out to our team. Each webhook subscription has its own secret key."

1. Contact the Vitable team (see the [Vitable developer docs](https://developer.vitablehealth.com/webhooks)) and give them your endpoint URL.
2. Store the subscription's secret key as `VITABLE_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes. Don't hex- or base64-decode it.
3. Keep it server-side. A separate subscription has a separate secret, so configure one secret per endpoint.

## Register Your Endpoint

Register the endpoint URL (for Hookdeck, the source URL it gives you) with Vitable. The endpoint receives `POST` requests with a JSON body for all the event types listed in [overview.md](overview.md).

## Headers on Each Request

| Header | Example |
|--------|---------|
| `X-Vitable-Signature` | `sha512=<128 hex characters>` |
| `X-Vitable-Timestamp` | `1769178600` |

## Respond Quickly

Return a `2xx` as soon as you have verified and recorded the event. If deliveries fail 25 times in a row, Vitable opens the circuit and stops sending until you ask them to re-enable the endpoint.

## Test Your Endpoint

Ask Vitable to trigger events for your subscription, or exercise the flows in the sandbox (for example a census sync, which produces `employee.eligibility_granted`). Inspect the deliveries in Hookdeck; if the signature check fails, see [verification.md](verification.md).
