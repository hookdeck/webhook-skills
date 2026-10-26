# Setting Up DoorDash Drive Webhooks

## Prerequisites

- A DoorDash Developer Portal account with Drive API access
- A public HTTPS endpoint (use the Hookdeck CLI locally). Production access must be requested before
  you can configure a Production webhook

## Configure the Endpoint

1. Open the Developer Portal and click **Webhooks** in the left navigation.
2. Click the plus (+) icon for the environment (Sandbox or Production). Each environment supports
   **one** webhook endpoint.
3. Enter your endpoint URL, for example `https://example.com/webhooks/doordash-drive`.
4. Choose the authentication type:
   - **Basic Auth**: enter the text DoorDash should send in the `Authorization` header. DoorDash sends
     it exactly as typed (often a bare token, not base64 `user:pass`). Generate a long random value.
   - **OAuth**: client ID, secret and token URL. Not covered by this skill.
5. Click **Configure Endpoint**.
6. Store the exact text as `DOORDASH_DRIVE_AUTHORIZATION`, including any scheme prefix you typed
   (for example `Bearer ...`).

Use a different credential per environment.

## Optional: Tracking and Refund Webhooks

- `dasher_enroute_to_*` events: submit a support request asking for them to be enabled.
- Refund webhooks: contact the DoorDash Integrations team via the Developer Portal for approval.

## Test in Sandbox

Use the delivery simulator to create a delivery or advance it through its stages. Each change sends a
webhook to your Sandbox endpoint.

## Local Testing

```bash
npx hookdeck-cli listen 3000 doordash-drive --path /webhooks/doordash-drive
```

Use the printed URL as the Sandbox webhook URL. For FastAPI, use port `8000`. To send a manual test:

```bash
curl -X POST http://localhost:3000/webhooks/doordash-drive \
  -H "Content-Type: application/json" \
  -H "Authorization: $DOORDASH_DRIVE_AUTHORIZATION" \
  -d '{"event_name":"DASHER_PICKED_UP","external_delivery_id":"c19a5d37-e457-4247-9a67-921ec0134125"}'
```
