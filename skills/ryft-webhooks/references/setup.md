# Set Up Ryft Webhooks

## Register the Endpoint

Use the Ryft Portal profile menu > Developer > Webhooks, or the Webhook API, to register the endpoint and obtain its secret. Configure test and live credentials separately.

Use `POST /webhooks/ryft`. Configure `RYFT_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 ryft --path /webhooks/ryft
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `RYFT` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://developer.ryftpay.com/documentation/get_started/webhooks)
- [Verification](https://developer.ryftpay.com/documentation/get_started/webhooks#webhook-authorization)
- [Sdk](https://github.com/RyftPay/ryft-dotnet/blob/master/RyftDotNet/test/RyftDotNet.Tests/Utility/Webhooks/WebhookSignatureVerifierTest.cs)
