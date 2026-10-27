# Set Up HIFI Webhooks

## Register the Endpoint

Register an endpoint with the HIFI Webhooks API, set its subscriptions, and store the signingSecret returned at registration. It is shown only once. To replace the secret, delete and register the endpoint again.

Use `POST /webhooks/hifi`. Configure `HIFI_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 hifi --path /webhooks/hifi
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `HIFI` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

Set `HIFI_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

## Official Documentation

- [Webhooks](https://docs.hifi.com/v3/core/webhooks/overview)
- [Verification](https://docs.hifi.com/v3/core/webhooks/overview)
