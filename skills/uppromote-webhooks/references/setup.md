# Set Up UpPromote Webhooks

## Register the Endpoint

Create a subscription for one topic and URL through the UpPromote API. After the first subscription, find the store Secret Key under Settings > Integrations > Get Secret Key. Set UPPROMOTE_WEBHOOK_TOPIC to the topic subscribed to this example URL; use a separate receiver configuration for another topic.

Use `POST /webhooks/uppromote`. Configure `UPPROMOTE_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 uppromote --path /webhooks/uppromote
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `UPPROMOTE` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://aff-api.uppromote.com/docs/v2/webhook-overview-1623756m0)
- [Verification](https://aff-api.uppromote.com/docs/v2/webhook-overview-1623756m0)
