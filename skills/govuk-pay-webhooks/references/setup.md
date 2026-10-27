# Set Up GOV.UK Pay Webhooks

## Register the Endpoint

In the GOV.UK Pay admin tool, open Settings > Developers > Webhooks, configure the endpoint and events, and use View to reveal this webhook's signing secret. Live callbacks require HTTPS with TLS 1.2 and a .gov.uk domain. Exceptions require support approval and a domain owned by your service or parent organisation. Use public tunnel URLs only for sandbox or not-live-yet testing; confirm an approved callback domain before live Hookdeck routing.

Use `POST /webhooks/govuk-pay`. Configure `GOVUK_PAY_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 govuk-pay --path /webhooks/govuk-pay
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `GOVUK_PAY` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.payments.service.gov.uk/webhooks/)
- [Verification](https://docs.payments.service.gov.uk/webhooks/#verifying-webhook-messages-from-gov-uk-pay)
