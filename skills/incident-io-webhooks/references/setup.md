# Setting Up incident.io Webhooks

## Prerequisites

- An incident.io account with permission to manage settings
- A public HTTPS URL for your endpoint (for local development, a Hookdeck CLI tunnel)
- For private incidents, alerts and escalations: an incident.io API key with private access, because
  those webhooks only carry the resource id

## How Do I Create a Webhook Endpoint?

1. In app.incident.io, go to **Settings → Webhooks**.
2. Add an endpoint and paste your URL, e.g. `https://example.com/webhooks/incident-io`.
3. Pick the event types to send (see [overview.md](overview.md)). Subscribe to the `private_*` variants
   only if your receiver can fetch private resources from the API.
4. Save.

## Where Is the Signing Secret?

Open the endpoint under **Settings → Webhooks** and copy its **Signing secret**. Each endpoint has its own.

```bash
INCIDENT_IO_WEBHOOK_SECRET=whsec_xxxxx
```

The Standard Webhooks serialization for a secret is `whsec_<base64>`, which the verifier base64-decodes
after the prefix. incident.io's docs don't say what format the dashboard displays, so the examples
accept both: a `whsec_` value is decoded, any other value is used as its UTF-8 bytes. Paste exactly what
the dashboard shows.

## Local Development

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 incident-io --path /webhooks/incident-io
# FastAPI
npx hookdeck-cli listen 8000 incident-io --path /webhooks/incident-io
```

Add the tunnel URL as an endpoint under **Settings → Webhooks**, copy its Signing secret into `.env`, then
trigger a subscribed event. The endpoint settings can **send test events**, show recent deliveries and
retry failed ones, which is quicker than declaring a real incident to exercise your handler.

## What Happens When My Endpoint Fails?

- Return 2xx (200 or 204) to acknowledge. Non-2xx responses are retried with exponential backoff over
  the next 24 hours.
- If deliveries to an endpoint keep failing for more than 5 days, incident.io disables it and emails your
  team.
- You can replay missed messages from the Svix app portal under **Settings → Webhooks**.

## Do I Need to Allowlist IPs?

Signature verification is the authentication mechanism. If your network also needs an allowlist, take the
current webhook sender ranges from <https://docs.incident.io/admin/webhook-ips>, or from
`GET /v1/ip_ranges` on the incident.io API. That endpoint returns both the webhook ranges and the separate
integration ranges used by workflow HTTP steps, each tagged with the traffic that uses it; allowlist the
webhook ones. Don't hardcode addresses copied from elsewhere.

## Compliance Note

incident.io states that webhooks are not currently HIPAA compliant and are excluded from its BAA. Don't
route PHI through them.
