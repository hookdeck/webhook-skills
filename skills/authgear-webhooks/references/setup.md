# Set Up Authgear Webhooks

## Register the Endpoint

In the Authgear portal, configure a non-blocking webhook under Advanced > Hooks. Reveal the project secret under Webhook Signature; reauthentication may be required. Register an HTTPS endpoint.

Only non-blocking events are supported. Blocking events expect a synchronous response from the receiver.

Use `POST /webhooks/authgear`. Configure `AUTHGEAR_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 authgear --path /webhooks/authgear
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `AUTHGEAR` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

## Official Documentation

- [Webhooks](https://docs.authgear.com/integrate/events-hooks/webhooks)
- [Verification](https://docs.authgear.com/integrate/events-hooks/webhooks#verifying-signature)
