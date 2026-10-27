# Set Up GitBook Webhooks

## Register the Endpoint

Install the Webhook integration in your GitBook organisation, configure its endpoint URL, and select events for the space or site. Configure the matching signing secret in your receiver. The guide does not specify where this secret is shown; confirm it in your installation or with GitBook.

Use `POST /webhooks/gitbook`. Configure `GITBOOK_WEBHOOK_SECRET` with the same secret as the sender; keep it out of source control.

## Test Locally

Start one of the example receivers and forward deliveries with:

```bash
npx hookdeck-cli listen 3000 gitbook --path /webhooks/gitbook
```

For FastAPI use port 8000. Configure the resulting public URL at the sender. Run the example's tests first, then trigger a real event in a test environment and inspect its headers and raw body.

## Hookdeck Event Gateway

Choose the `GITBOOK` source type once it is available in your environment and configure its verification secret. Named sources answer 200 at ingress; a failed signature is recorded as failed verification afterwards. The example receivers themselves return 401 for invalid signatures. Hookdeck applies no timestamp tolerance.

Set `GITBOOK_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

## Official Documentation

- [Webhooks](https://gitbook.com/docs/developers/integrations/guides/webhook)
- [Verification](https://gitbook.com/docs/developers/integrations/guides/webhook#hmac-signature-verification)
