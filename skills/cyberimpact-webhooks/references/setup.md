# Setting Up Cyberimpact Webhooks

## Prerequisites

- A Cyberimpact account with marketing automation included in the plan
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 cyberimpact --path /webhooks/cyberimpact` locally)

## Choose Your Secret

Cyberimpact does not generate a signing secret. Pick a long random value yourself and store it as
`CYBERIMPACT_WEBHOOK_SECRET`. Pick the header name too, and store it as
`CYBERIMPACT_WEBHOOK_HEADER`.

**Use a simple header name without spaces or special characters, such as `Authorization`.**
Cyberimpact rejects header keys that contain spaces or special characters.

The expected value is the exact, whole header value. If you type `Bearer abc123` in the scenario,
set `CYBERIMPACT_WEBHOOK_SECRET=Bearer abc123`.

## Register Your Endpoint

1. Create a scenario (or open one) in **Marketing automation**.
2. Press the **+** icon at the right point in the scenario path and select **Send a Webhook**.
3. Enter the complete destination URL, including `https://`
   (e.g. `https://example.com/webhooks/cyberimpact`).
4. In the **Headers** section add a key-value pair: the key is your header name (such as
   `Authorization`) and the value is your secret.
5. In **Data to be transmitted**, select the contact information to send. Add
   **Additional information** key-value pairs if you need them.
6. Press **Test** next to the URL. A green check mark means your endpoint answered `200`.
7. Click **Add**, then activate the scenario.

## Test

The Test button sends an `automation.webhook.send` body with sample contact data. To test the
real flow, activate the scenario and use an email address that meets its entry criteria; add a
segmentation condition on that email so other contacts don't enter. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/cyberimpact \
  -H "Content-Type: application/json" \
  -H "Authorization: $CYBERIMPACT_WEBHOOK_SECRET" \
  -d '{"id":"test_evt_1","event":"automation.webhook.send","timestamp":"2024-05-28T12:56:40Z","idClient":3,"data":{"type":"member","id":54321,"email":"john.doe@example.org","firstname":"John","lastname":"Doe"}}'
```

## Network Notes

No source IP range is documented, so an IP allowlist is not an option. Rely on the secret header
and HTTPS.
