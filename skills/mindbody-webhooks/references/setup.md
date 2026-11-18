# Setting Up Mindbody Webhooks

## Prerequisites

- A Mindbody developer account with **live access approved**. Until then the Webhooks API answers `403 developerAccountNotActive` (code `14030002`). The free sandbox site (`-99`) alone isn't enough.
- An activated link between your developer account and at least one Mindbody business
- An API key from the API Credentials page of the developer portal (the Public API key works)
- A public HTTPS endpoint (TLS 1.2+) that answers `HEAD` with a 2xx

## 1. Make the URL Answer HEAD

Creating a subscription makes Mindbody send a `HEAD` request to `webhookUrl`, and `PATCH` can check it again. A non-2xx answer or a timeout fails the call with `invalidWebhookURLNoResponse` (400, `14000014`). The examples answer `HEAD` with an empty `200`. Deploy that first.

## 2. Create the Subscription

```bash
curl -X POST https://mb-api.mindbodyonline.com/push/api/v1/subscriptions \
  -A "YourAppName" \
  -H "API-Key: {yourAPIKey}" \
  -H "Content-Type: application/json" \
  -d '{
    "eventIds": ["classRosterBooking.created", "client.created"],
    "eventSchemaVersion": 1,
    "referenceId": "my-reference",
    "webhookUrl": "https://your-app.example.com/webhooks/mindbody"
  }'
```

The response includes the subscription's `subscriptionId`, its status (`PendingActivation`) and the **`messageSignatureKey`**. This is the only endpoint that returns the key, so store it now. Mindbody APIs require a `User-Agent` header (`-A` above).

## 3. Activate It

```bash
curl -X PATCH https://mb-api.mindbodyonline.com/push/api/v1/subscriptions/{subscriptionId} \
  -A "YourAppName" \
  -H "API-Key: {yourAPIKey}" \
  -H "Content-Type: application/json" \
  -d '{ "Status": "Active" }'
```

A `PendingActivation` subscription receives nothing until you do this.

## 4. Configure the Key

Set `MINDBODY_MESSAGE_SIGNATURE_KEY` to the `messageSignatureKey` exactly as returned. Don't base64-decode it.

## Test

Trigger an event at the linked business (for example book a client into a class) and watch for it. `DELETE .../subscriptions/{subscriptionId}` deactivates a test subscription.

### Local testing with the Hookdeck CLI

A plain CLI source URL always fails the `HEAD` check: Hookdeck answers `HEAD` on a plain source with a `405` and doesn't forward it to localhost, so creating the subscription fails with `invalidWebhookURLNoResponse`.

1. In the Hookdeck dashboard, create a source of type **Mindbody** named `mindbody`. Hookdeck answers `HEAD` for Mindbody sources.
2. Log in and listen. The CLI reuses the existing source:

   ```bash
   npx hookdeck-cli login
   npx hookdeck-cli listen 3000 mindbody --path /webhooks/mindbody
   ```

3. Use the printed source URL as `webhookUrl`, then activate the subscription.

Alternatively, allow `HEAD` on a plain source in **Source Configuration > Advanced Source Configuration** (HTTP methods), or append `?x-hookdeck-allow-methods=post,head` to the source URL (the parameter replaces the source's methods for that request, so keep `post` in it). Hookdeck then accepts the `HEAD` and forwards it to the example, which answers `200`. With `HEAD` allowed, uptime monitors and link checkers that hit the URL count as requests.

## Using Hookdeck

Create a source with the **Mindbody** source type and paste the `messageSignatureKey` as-is. Hookdeck verifies `X-Mindbody-Signature` and answers Mindbody's `HEAD` check with `200`, so you can use the source URL as `webhookUrl`.
