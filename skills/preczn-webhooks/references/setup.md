# Set Up Preczn Webhooks

## Register the Endpoint

Create a Test-mode or Live-mode webhook subscription. Copy its signing secret from the create response or reveal it under Settings > Webhooks. Use the secret for that subscription and mode.

Use `POST /webhooks/preczn`. Configure `PRECZN_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 preczn --path /webhooks/preczn
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `PRECZN` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.preczn.com/docs/receiving-and-verifying-webhooks)
- [Verification](https://docs.preczn.com/docs/receiving-and-verifying-webhooks)
