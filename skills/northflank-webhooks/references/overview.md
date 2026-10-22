# Northflank Webhooks Overview

## What Are Northflank Webhooks?

Northflank can send platform notifications to Slack, Discord, Microsoft Teams, or to a
**webhook** URL you control. A webhook notification integration is created in the account or
team settings (Observability → Notifications) and picks which event types it receives and,
optionally, which projects. Organisation integrations carry billing events and cluster
provisioning errors only.

Each notification is a `POST` with a JSON body. Respond with any `2xx` to mark it handled.
Otherwise the integration is marked failing, the notification is resent a limited number of
times, and webhooks that keep failing are disabled automatically. Past requests, headers, bodies
and your responses are listed on the integration page, where you can also resend one.

## Request Format

| Header | Meaning |
|--------|---------|
| `X-Northflank-Notification-Integration-Id` | ID of the integration that sent the request |
| `X-Northflank-Notification-Integration-Name` | Name of that integration |
| `X-Northflank-Notification-Integration-Token` | The secret set on the integration (sent raw, no signature) |
| `X-Northflank-Notification-Integration-Event-Id` | ID of the event in the request (use for idempotency) |
| `X-Northflank-Notification-Integration-Event-Type` | Event type, e.g. `build:start` |

Body: `{"event": "<type>", "data": {...}}`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `build:start` | A build starts | Show build progress |
| `build:success` | A build succeeds | Trigger a release, notify a channel |
| `build:failure` | A build fails | Open a ticket, alert the team |
| `build:abort` | A build is aborted | Clean up pending work |
| `service:deployment:status-update` | A deployment's status changes | Update a status dashboard |
| `job-run:start` / `success` / `failure` / `abort` / `terminate` | A job run changes state | Create a ticket when a job fails |
| `addon-backup:start` / `success` / `failure` / `abort` | An addon backup changes state | Fetch a finished backup via the API into off-site storage |
| `billing:invoice-paid` | An invoice is paid | Reconcile accounting |
| `billing:invoice-payment-failed` | An invoice payment fails | Alert finance |
| `billing:billing-alert-exceeded` | A billing alert threshold is exceeded | Cost alerts |

The integration form offers more triggers: `release-flow-template-run:*`,
`preview-blueprint-run:*`, `template-run:*`, `resource:certificate-success`,
`resource:certificate-final-failure`, `cdn:action-*`, `log-sink:paused`,
`billing:invoice-payment-action-required`, `billing:invoice-carried-over`, and infrastructure
alerts such as `infrastructure:service:container-crash`.

## Event Payload Structure

The documentation shows the `build:start` payload:

```json
{
  "event": "build:start",
  "data": {
    "build": {
      "id": "social-hour-1312",
      "branch": "master",
      "pullRequestId": null,
      "status": "STARTING",
      "sha": "ca624abed0d5ba0ad6e6fe28c396196b81f0200d",
      "concluded": false,
      "createdAt": "2022-01-19T09:04:40.916Z"
    },
    "service": { "id": "website", "name": "Website" },
    "project": { "id": "personal-blog", "name": "Personal Blog" },
    "user": { "id": "thomas" }
  }
}
```

Northflank's docs show the payload data only for build events. Event strings for other types
follow the trigger names above, but read their `data` defensively (optional chaining) and check
a real delivery on the integration's recent-events page.

## Full Event Reference

- Webhook notifications: https://northflank.com/docs/v1/application/observe/configure-notification-integrations
- Trigger list (create notification integration API): https://northflank.com/docs/v1/api/integrations/create-notification-integration
