# Argo CD Webhooks Overview

## What Are Argo CD Webhooks?

Argo CD Notifications can send a generic HTTP request when something happens to an application:
a sync succeeds or fails, health degrades, an app is deployed. You define a **webhook service**
(`service.webhook.<name>` in the `argocd-notifications-cm` ConfigMap), a **template** that sets
the request method and body, and a **trigger** that decides when to send. Applications subscribe
to a trigger and a service with an annotation.

These requests are **not signed** and carry **no event field**. You authenticate them with a
header you add to the webhook service, and the body is whatever your template renders.

## What the Request Looks Like

| Part | Behaviour |
|------|-----------|
| Method | Set by the template: `GET`, `POST`, `PUT` or `PATCH`. **Default `GET`**, which still carries the body |
| Headers | Every header listed under the service's `headers` is sent on each request |
| Body | The template's `body`, rendered with Go templates (e.g. `{{.app.metadata.name}}`), sent with any method. With no `webhook` block, the notification `message` |
| Auth | Your own header (`headers`) or `basicAuth` on the service. No signature, no timestamp |
| Retries | The notification service retries network errors and 5xx responses (`retryMax` default 3) |

## Illustrative Payload

Because the body is yours, this skill's examples use an **illustrative** payload written by the
template in [setup.md](setup.md). The `trigger` field is added by that template; Argo CD itself
sends no such field.

```json
{
  "trigger": "on-sync-succeeded",
  "app": "guestbook",
  "sync_status": "Synced",
  "health": "Healthy"
}
```

| `trigger` (illustrative) | Sent When (your trigger's `when` condition) |
|--------------------------|---------------------------------------------|
| `on-sync-succeeded` | `app.status.operationState.phase in ['Succeeded']` |
| `on-sync-failed` | the sync operation phase is `Error` or `Failed` |
| `on-health-degraded` | `app.status.health.status == 'Degraded'` |

Rename the triggers or fields to suit your setup and update the handler's `switch` to match.

## Full Reference

- [Webhook notification service](https://argo-cd.readthedocs.io/en/stable/operator-manual/notifications/services/webhook/)
