# Setting Up Better Stack Outgoing Webhooks

## Prerequisites

- A Better Stack account with Uptime / incident management
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 better-stack --path /webhooks/better-stack` locally)

## Choose a Credential

Better Stack does not sign webhooks and has no signing secret. You choose a static credential that
the webhook sends on every request. Pick one (or configure both and accept either):

- **Custom header (recommended).** Add a header to the webhook's request template
  (`headers_template` in the API) with a name you pick and a long random value, for example
  `X-Better-Stack-Secret`. Store the name in `BETTER_STACK_WEBHOOK_HEADER` and the exact value in
  `BETTER_STACK_WEBHOOK_SECRET`.
- **Basic auth.** Set `auth_username` and `auth_password` (both, or neither) on the webhook. Store
  them in `BETTER_STACK_WEBHOOK_USERNAME` and `BETTER_STACK_WEBHOOK_PASSWORD`.

**Basic auth caveat:** Better Stack's docs don't say whether the Basic credentials are sent
preemptively on the first request or only after a `401 WWW-Authenticate` challenge. Your endpoint,
and Hookdeck's Better Stack source, never send that challenge, so if Basic auth deliveries are
rejected, switch to the custom header.

## Register Your Endpoint

In the dashboard:

1. Go to **Incidents -> Integrations -> Exporting data** and find the **Outgoing webhooks** section.
2. Click **Configure**.
3. Click **Add** on the card of the webhook type you want: **Incident webhook**, **Monitor
   webhook** or **On-call change webhook**.
4. Enter your **Webhook URL**. Optionally pick which events trigger the webhook and customise the
   request template (HTTP method, headers, body, credentials).

Or with the API (`POST https://incidents.betterstack.com/api/v2/outgoing-webhooks`, authorised with
`Authorization: Bearer $TOKEN`):

```json
{
  "name": "Incidents to my app",
  "url": "https://example.com/webhooks/better-stack",
  "trigger_type": "incident_change",
  "on_incident_started": true,
  "on_incident_acknowledged": true,
  "on_incident_resolved": true,
  "on_incident_reopened": true,
  "on_incident_comment": true,
  "custom_webhook_template_attributes": {
    "http_method": "post",
    "headers_template": [
      { "name": "Content-Type", "value": "application/json" },
      { "name": "X-Better-Stack-Secret", "value": "<long random secret>" }
    ]
  }
}
```

`trigger_type` is `incident_change`, `monitor_change` or `on_call_change`. The `on_incident_*`
toggles apply only to `incident_change` and each defaults to `true`. If you omit `body_template`,
the default template for the trigger type is used. To use Basic auth instead, set
`auth_username` and `auth_password` in `custom_webhook_template_attributes`.

## HTTP Method and Body

The webhook's `http_method` is one of `get`, `post`, `put`, `patch`, `head` or `options` (default
`post`). The examples accept all six and check the credential before anything else. The body is a
template you can edit; no default `Content-Type` is documented, so the examples read the raw body.
Add a `Content-Type: application/json` header (as above) if you want a JSON content type.

## Hookdeck

Create a source with type **Better Stack**. Hookdeck's source checks the credential and offers two
methods:

- **Basic auth** (the default): enter the same username and password as the webhook.
- **Custom header**: enter the header name (placeholder `X-Better-Stack-Secret`) and its value.
  Hookdeck finds the header case-insensitively and compares the whole value.

The source pre-selects `POST` without managing the method. If the webhook uses another method,
allow it on the source as well. Hookdeck sources can allow `GET`, `HEAD`, `POST`, `PUT` and
`PATCH` but not `OPTIONS`, so don't use `options` for a webhook routed through Hookdeck.

## Test

Send a request with curl:

```bash
curl -X POST http://localhost:3000/webhooks/better-stack \
  -H "Content-Type: application/json" \
  -H "X-Better-Stack-Secret: $BETTER_STACK_WEBHOOK_SECRET" \
  -d '{"data":{"id":"1","type":"incident","attributes":{"name":"Tesla.com homepage","cause":"Error 500","started_at":"2026-10-26T10:51:28.151Z","acknowledged_at":"","resolved_at":""}}}'
```

or with Basic auth: `-u "$BETTER_STACK_WEBHOOK_USERNAME:$BETTER_STACK_WEBHOOK_PASSWORD"`. To test from
Better Stack, trigger a real change (comment on an incident, or pause a monitor).

## Delivery Notes

The Uptime pages document no timeout, retry policy or IP list. Return a 2xx promptly and process
asynchronously.
