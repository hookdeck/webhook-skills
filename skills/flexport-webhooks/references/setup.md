# Setting Up Flexport Webhooks

## Prerequisites

- A Flexport account with access to the **Settings** area
- Your application's public HTTPS webhook endpoint URL (e.g. `https://your-app.com/webhooks/flexport`)

## Register Your Endpoint

Flexport webhook endpoints are configured in the account **Settings** section of
the Flexport app (the classic freight product configures these through the UI —
there is no public `POST /webhook_endpoints` for creating them).

1. Sign in to Flexport and open **Settings**.
2. Find the **Webhooks** / API notifications area.
3. Add a new webhook endpoint with your public HTTPS URL.
4. Select the event categories you want delivered. Milestones marked with an
   asterisk on Flexport's Milestones page are **available upon request**, and
   selecting a category doesn't activate them: ask your Flexport team.

## Get Your Secret Token

Each endpoint has its own **secret token** used to sign deliveries.

1. When creating or editing the endpoint, set (or copy) the **secret token**.
2. Store it as `FLEXPORT_WEBHOOK_SECRET` in your application environment. This is
   the key Flexport uses to compute the `X-Hub-Signature-256` HMAC — keep it
   secret and never commit it.

Flexport signs each delivery with an HMAC of the raw request body keyed on this
secret token and sends the digest in the `X-Hub-Signature-256` header (and the
legacy `X-Hub-Signature` SHA-1 header). See [verification.md](verification.md).

## Respond Fast, Process Async

Your endpoint **must return HTTP `200`** promptly to acknowledge receipt.
Flexport retries a delivery a number of times when it doesn't get a `200`, with no
published count or schedule, so reconcile with the Events API (`GET /events`) after
an outage. Do the minimum synchronously (verify the
signature, enqueue the event) and process the work asynchronously so you always
respond quickly.

## Testing

- Trigger real milestones on a test shipment (create a shipment, advance a leg).
- Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to tunnel deliveries to
  your local server while developing:

  ```bash
  npx hookdeck-cli listen 3000 flexport --path /webhooks/flexport
  ```

  Point your Flexport endpoint URL at the Hookdeck URL the CLI prints. No account
  is required — the CLI creates a guest account and gives you a web UI to inspect
  and replay requests.
