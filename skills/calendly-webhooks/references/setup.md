# Setting Up Calendly Webhooks

Calendly webhooks are created via the **API**, not the dashboard. You create a
*webhook subscription* with an authenticated request; Calendly returns a **signing
key** that you use to verify incoming payloads.

## Prerequisites

- A Calendly account on a paid plan (webhooks require a Standard plan or higher).
- A **personal access token** or **OAuth access token** with the appropriate scope.
  Create a personal access token in Calendly under **Integrations & apps → API & webhooks**.
- Your organization or user URI. Fetch it from `GET https://api.calendly.com/users/me`.
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development).

## Create a Webhook Subscription

`POST` to the webhook subscriptions endpoint with the events you want to receive:

```bash
curl --request POST \
  --url https://api.calendly.com/webhook_subscriptions \
  --header "Authorization: Bearer $CALENDLY_ACCESS_TOKEN" \
  --header "Content-Type: application/json" \
  --data '{
    "url": "https://your-app.com/webhooks/calendly",
    "events": [
      "invitee.created",
      "invitee.canceled",
      "invitee_no_show.created",
      "routing_form_submission.created"
    ],
    "organization": "https://api.calendly.com/organizations/AAAAAAAAAAAAAAAA",
    "scope": "organization",
    "signing_key": "your_generated_signing_key"
  }'
```

Notes:

- `scope` can be `organization` or `user`. For `user` scope, also include a `user` URI.
- **`signing_key`** — provide your own random secret (recommended) so you know it up
  front, or omit it and read the value Calendly returns. Either way, the response's
  `resource.signing_key` is what you store as `CALENDLY_WEBHOOK_SIGNING_KEY` and use
  for signature verification.

## Get / Store the Signing Key

The create response looks like:

```json
{
  "resource": {
    "uri": "https://api.calendly.com/webhook_subscriptions/XXXX",
    "callback_url": "https://your-app.com/webhooks/calendly",
    "events": ["invitee.created", "invitee.canceled"],
    "signing_key": "s0m3-r4nd0m-s1gn1ng-k3y",
    "state": "active"
  }
}
```

Store `resource.signing_key` securely (environment variable / secrets manager) as:

```bash
CALENDLY_WEBHOOK_SIGNING_KEY=s0m3-r4nd0m-s1gn1ng-k3y
```

Each subscription has its **own** signing key. If you create multiple subscriptions,
verify each request with the matching subscription's key.

## Test Your Endpoint

- **Local development:** run `npx hookdeck-cli listen 3000 calendly --path /webhooks/calendly`
  and point your subscription's `url` at the tunnel URL.
- **Trigger real events:** schedule, cancel, or mark a no-show on a booked event to
  fire `invitee.created`, `invitee.canceled`, and `invitee_no_show.created`.

## Managing Subscriptions

- List: `GET https://api.calendly.com/webhook_subscriptions?organization=...&scope=organization`
- Delete: `DELETE https://api.calendly.com/webhook_subscriptions/{uuid}`

See [Calendly's webhook subscription API](https://developer.calendly.com/api-docs/c1ddba8ce4a0d-webhook-subscriptions)
for the full reference.
