# Set Up Medplum Webhooks

## Register the Endpoint

Create an active FHIR Subscription with channel.type rest-hook, your channel.endpoint and the criteria you want. Add https://www.medplum.com/fhir/StructureDefinition/subscription-secret with valueString set to a strong secret, and configure the same value in the receiver.

Add a subscription-secret extension to the Medplum Subscription. Without it, deliveries are unsigned and fail verification.

Use `POST /webhooks/medplum`. Configure `MEDPLUM_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 medplum --path /webhooks/medplum
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `MEDPLUM` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

If the sender is configured for unsigned delivery, leave source verification disabled or enable signing at the sender first. These examples deliberately require signed requests.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://www.medplum.com/docs/subscriptions)
- [Verification](https://www.medplum.com/docs/subscriptions/subscription-extensions#signatures)
- [Deletions](https://www.medplum.com/docs/subscriptions/subscription-extensions#subscriptions-for-delete-events)
