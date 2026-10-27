# Set Up vivenu Webhooks

## Register the Endpoint

Create a seller-account webhook in Developer > Webhooks or through the API. Select events and set an hmacKey, then configure the same key in the receiver. Trigger an actual event in the dev environment to test; the docs do not offer synthetic test events.

Set an hmacKey on the vivenu webhook. Without one, deliveries are unsigned and fail verification.

Use `POST /webhooks/vivenu`. Configure `VIVENU_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 vivenu --path /webhooks/vivenu
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `VIVENU` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

If the sender is configured for unsigned delivery, leave source verification disabled or enable signing at the sender first. These examples deliberately require signed requests.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.vivenu.com/api/core/webhooks)
- [Verification](https://docs.vivenu.com/api/core/webhooks#security)
