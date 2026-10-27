# Set Up Thought Industries Webhooks

## Register the Endpoint

Under Users > Manager Notifications, choose a trigger, select the Webhook channel, and configure the URL. Ask Thought Industries Support for your Site Secret. It is distinct from your API key and is not displayed in Admin. Use Test Event to inspect a delivery.

Ask Thought Industries Support for your Site Secret and paste it here.

Use `POST /webhooks/thought-industries`. Configure `THOUGHT_INDUSTRIES_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 thought-industries --path /webhooks/thought-industries
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `THOUGHT_INDUSTRIES` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://developer.thoughtindustries.com/docs/webhooks/)
- [Verification](https://developer.thoughtindustries.com/docs/webhooks/)
