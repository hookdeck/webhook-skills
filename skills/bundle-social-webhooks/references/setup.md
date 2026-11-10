# Setting Up bundle.social Webhooks

## Prerequisites

- A bundle.social account with an API key (webhooks are an API feature)
- A public **HTTPS** URL for your endpoint, for example
  `https://your-app.com/webhooks/bundle-social`. bundle.social doesn't deliver to
  plain `http://` URLs; use a tunnel for local development (see below).

## Add the Webhook

1. Open the [Webhooks dashboard](https://bundle.social/dashboard/organization/webhooks)
   (organization settings).
2. Add your endpoint URL.
3. Optionally limit which events it receives. With no event filter, the endpoint
   gets every event type, including ones added later.
4. Copy the webhook's **Signing Secret** and store it as an environment variable:

```bash
BUNDLE_SOCIAL_WEBHOOK_SECRET=<your-signing-secret>
```

Webhooks belong to the organization, so a single endpoint receives events for all
teams. Use `data.teamId` (or `data.organizationId`) to route events.

## Test

- Publish a post through the API or dashboard; you'll get `post.published`.
- Connect a social account to get `social-account.created` and `team.updated`.
- Resend any past event from the dashboard to replay it with the same payload.

## Local Development

Forward deliveries to localhost with the Hookdeck CLI (no account required):

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 bundle-social --path /webhooks/bundle-social

# FastAPI
npx hookdeck-cli listen 8000 bundle-social --path /webhooks/bundle-social
```

Add the HTTPS URL Hookdeck prints as the webhook URL in the dashboard.

## Keep the Endpoint Healthy

- Return `2xx` within 15 seconds, even for event types you ignore.
- If the endpoint goes 7 days without a successful delivery, bundle.social disables
  it and emails the organization owner. Re-enable it from the dashboard or API;
  events sent while it was disabled are not replayed.
