# Set Up Root Webhooks

## Register the Endpoint

Create a webhook through Root's API for the organisation and environment, with the required subscriptions. Save the secret returned by the create response. A separately chosen verification_token is echoed in the body and does not replace signature verification.

Use `POST /webhooks/root-platform`. Configure `ROOT_PLATFORM_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 root-platform --path /webhooks/root-platform
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `ROOT_PLATFORM` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.rootplatform.com/reference/webhooks)
- [Verification](https://docs.rootplatform.com/docs/webhook-setup-and-verification)
