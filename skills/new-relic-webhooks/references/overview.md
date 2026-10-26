# New Relic Webhooks Overview

## What Are New Relic Alert Webhooks?

New Relic Alerts notifies external systems through **destinations** and **workflows**. A workflow
matches issues and sends a notification to a destination. With a **Webhook** destination, New
Relic sends an HTTP POST with a JSON body to the Endpoint URL you choose. Requests are not
signed. A destination can send HTTP Basic authentication credentials so you can check that a
request came from your New Relic configuration. This skill covers Basic authentication only.

The JSON body is rendered from a Handlebars template that you edit in the workflow. New Relic
supplies a default payload, and you can rewrite it freely, so **there is no fixed event field**.
The state of the issue is whatever your template puts in the body.

## Illustrative Notification States

The examples assume the template in [setup.md](setup.md). New Relic's docs don't list the values
of its `state` template variable, so that template derives `state` itself from `issueClosedAt` and
`issueAcknowledgedAt` (the conditional New Relic's xMatters template uses). The values are the
template's own strings:

| `state` | Set When | Common Use Cases |
|---------|----------|------------------|
| `open` | Neither `issueClosedAt` nor `issueAcknowledgedAt` is set | Page on-call, open a ticket |
| `acknowledged` | `issueAcknowledgedAt` is set, `issueClosedAt` isn't | Mark the ticket as being worked |
| `closed` | `issueClosedAt` is set | Close the ticket |

## Illustrative Payload Structure

```json
{
  "issueId": "a1b2c3d4-0000-4000-8000-000000000001",
  "title": "High CPU on web-1",
  "state": "open",
  "priority": "CRITICAL",
  "issuePageUrl": "https://one.newrelic.com/alerts-ai/issues/a1b2c3d4"
}
```

These fields are an example template, not a schema. Other variables are available in the
template (for example `issueAckUrl` and `accumulations`); see the New Relic docs for the list.

## Full Reference

See [New Relic's notification integrations documentation](https://docs.newrelic.com/docs/alerts/get-notified/notification-integrations/#webhook).
