# Setting Up Calendly Webhooks

Calendly webhooks are created via the **API**, not the dashboard. You create a
*webhook subscription* with an authenticated request. With a personal access token you
choose the **signing key** and send it in that request; an OAuth 2.0 app gets its key
when the app is created.

## Prerequisites

- A Calendly account. Most events work on every plan, including Free.
  `routing_form_submission.created` and the `meeting_recap.*` events need a plan that
  includes those features (judged by the organization owner's plan); without it, creating
  the subscription returns `403` "Please upgrade to a paid Calendly account."
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

- `scope` can be `organization`, `user` or `group`. For `user` scope, also include a
  `user` URI; for `group` scope, a `group` URI. `routing_form_submission.created` allows
  only `organization` scope and the `meeting_recap.*` events only `user`, so they need
  separate subscriptions.
- **`signing_key`** — with a personal access token this is optional, but set it: it's the
  key Calendly signs deliveries with, and the docs don't say what a subscription without
  one sends. Generate a random secret, send it here and store the same value as
  `CALENDLY_WEBHOOK_SIGNING_KEY`. You can use one key for every subscription or a unique
  key for each.
- A URL can only have one subscription: a second one returns `409` "Hook with this url
  already exists".

## Get / Store the Signing Key

The documented subscription object (in the create, get and list responses) does **not**
include the signing key, so keep the value you sent. Store it securely (environment
variable / secrets manager):

```bash
CALENDLY_WEBHOOK_SIGNING_KEY=your_webhook_signing_key_here
```

- **Personal access tokens:** the key is whatever you set in `signing_key`. If you use
  different keys for different subscriptions, verify each request with the matching one.
- **OAuth 2.0 apps:** Calendly generates one signing key when you create the app, and it
  signs every webhook for that app. If you lost it, Calendly says to contact its
  developer support.

## Test Your Endpoint

- **Local development:** run `npx hookdeck-cli listen 3000 calendly --path /webhooks/calendly`
  and point your subscription's `url` at the tunnel URL.
- **Sample bodies:** `GET https://api.calendly.com/sample_webhook_data?event=invitee.created&organization=...&scope=organization`
  returns an example payload for any event.
- **Trigger real events:** schedule, cancel, or mark a no-show on a booked event to
  fire `invitee.created`, `invitee.canceled`, and `invitee_no_show.created`.

## Managing Subscriptions

- List: `GET https://api.calendly.com/webhook_subscriptions?organization=...&scope=organization`
- Delete: `DELETE https://api.calendly.com/webhook_subscriptions/{uuid}`
- Watch `state` (`active` or `disabled`): after 24 hours of failed deliveries Calendly
  disables a subscription, and it has to be created again.

See [Calendly's Create Webhook Subscription reference](https://developer.calendly.com/api-docs/calendly-api/webhooks/create-webhook-subscription)
for the full reference.
