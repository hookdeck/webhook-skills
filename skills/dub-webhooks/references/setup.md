# Set Up Dub Webhooks

## Register the Endpoint

Create a webhook in Dub and copy its signing secret from the webhook's Configuration tab. Keep the entire whsec_ prefix and the rest of the secret unchanged.

Paste the whole secret, including the whsec_ prefix. Dub uses it as a plain HMAC key.

Use `POST /webhooks/dub`. Configure `DUB_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 dub --path /webhooks/dub
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `DUB` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://dub.co/docs/webhooks/introduction)
- [Verification](https://dub.co/docs/webhooks/verify-webhook-requests)
