# Set Up Survicate Webhooks

## Register the Endpoint

Copy the workspace Signing Secret from Survicate Webhooks Settings. In the survey's Connect tab, configure the webhook URL and choose questionAnswered or surveyCompleted. Use Send sample request to test. The separate Verification Token is sent in plaintext and is not used by this HMAC verifier.

Use `POST /webhooks/survicate`. Configure `SURVICATE_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 survicate --path /webhooks/survicate
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `SURVICATE` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://developers.survicate.com/webhooks/)
- [Verification](https://developers.survicate.com/webhooks/security/)
- [Setup](https://developers.survicate.com/getting-started/#7-get-the-data-out)
