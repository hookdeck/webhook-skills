# Set Up Fingerprint Webhooks

## Register the Endpoint

Create a webhook in the Fingerprint dashboard, enable signature protection, and save the symmetric key shown at creation. Send an identification request to produce a delivery.

Use `POST /webhooks/fingerprint`. Configure `FINGERPRINT_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 fingerprint --path /webhooks/fingerprint
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `FINGERPRINT` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.fingerprint.com/docs/webhooks)
- [Verification](https://docs.fingerprint.com/docs/webhooks#webhook-signatures)
- [Sdk](https://github.com/fingerprintjs/node-sdk/blob/v7.9.0/src/webhook.ts)
