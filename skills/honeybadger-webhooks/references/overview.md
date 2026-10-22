# Honeybadger Webhooks Overview

## What Are Honeybadger Webhooks?

Honeybadger's Webhook integration (Team, Business and Enterprise plans) posts a JSON payload to
a URL you choose whenever something happens in a project. It covers error monitoring, uptime
monitoring, check-ins and deploys. Requests are not signed; each one carries a
`Honeybadger-Token` header derived from the project API key so you can confirm it came from
Honeybadger.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `occurred` | An error occurs | Page on-call, open a ticket |
| `resolved` | An error is marked as resolved | Close the ticket |
| `unresolved` | A resolved error occurs again | Reopen the ticket |
| `assigned` | An error is assigned to a user | Notify the assignee |
| `commented` | A comment is added to an error | Sync comments |
| `rate_exceeded` | The error rate threshold is exceeded | Escalate |
| `volume_spike` | Error volume spikes above its learned baseline | Escalate |
| `deployed` | A deployment is recorded | Annotate dashboards |
| `down` | An uptime check fails | Start an incident |
| `up` | An uptime check succeeds after being down | Resolve the incident |
| `cert_will_expire` | An SSL certificate is about to expire | Renew the certificate |
| `check_in_missing` | An expected check-in is missing | Alert on a stalled job |
| `check_in_reporting` | A check-in reports successfully | Clear a missing alert |

## Event Payload Structure

Every payload is a JSON object with:

- `event` - the event type from the table above
- `message` - a human-readable description
- event-specific objects:

| Events | Top-level properties |
|--------|----------------------|
| `occurred` | `event`, `message`, `project`, `fault`, `notice` |
| `resolved`, `unresolved`, `rate_exceeded` | `event`, `message`, `project`, `fault` |
| `assigned` | `event`, `message`, `actor`, `fault`, `assignee` |
| `commented` | `event`, `message`, `actor`, `fault`, `comment` |
| `deployed` | `event`, `message`, `project`, `deploy` |
| `down`, `up` | `event`, `message`, `project`, `site`, `outage` |
| `cert_will_expire` | `event`, `message`, `project`, `site` |
| `check_in_missing`, `check_in_reporting` | `event`, `message`, `project`, `check_in` |
| `volume_spike` | `event`, `message`, `project`, `volume_spike` |

Example `occurred` payload (from the docs):

```json
{
  "event": "occurred",
  "message": "[Crywolf/test] RuntimeError - oops",
  "fault": {
    "id": 3151009,
    "project_id": 1717,
    "klass": "RuntimeError",
    "environment": "development",
    "resolved": true,
    "ignored": false,
    "created_at": "2014-01-08T18:55:48Z",
    "comments_count": 1,
    "message": "oops",
    "notices_count": 9,
    "last_notice_at": "2014-01-08T19:02:21Z"
  }
}
```

## Full Event Reference

See [Honeybadger's webhook documentation](https://docs.honeybadger.io/guides/integrations/webhook/).
