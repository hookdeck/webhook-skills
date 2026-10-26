# Setting Up Argo CD Notification Webhooks

## Prerequisites

- Argo CD with the Notifications controller (bundled in recent releases)
- Permission to edit the `argocd-notifications-cm` ConfigMap and `argocd-notifications-secret`
- Your application's webhook endpoint URL (HTTPS)

## Hookdeck Source Setup Note

Argo CD webhooks are not signed. Add a secret header to the webhook service (service.webhook.<name>.headers in argocd-notifications-cm) and enter it here. Argo CD sends GET unless the notification template sets a method, so GET and POST are both allowed.

Hookdeck's Argo CD source pre-selects GET and POST without managing the method, so if a
template uses PUT or PATCH, allow that method on the source too.

## Store the Shared Secret

Put the secret in `argocd-notifications-secret`, then reference it as `$<key>` in the ConfigMap:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: argocd-notifications-secret
stringData:
  webhook-secret: Bearer your-shared-secret
type: Opaque
```

## Configure the Webhook Service, Template and Trigger

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
data:
  service.webhook.deploy-events: |
    url: https://your-app.example.com/webhooks/argo-cd
    headers:
    - name: Authorization
      value: $webhook-secret
    - name: Content-Type
      value: application/json

  template.sync-succeeded-webhook: |
    webhook:
      deploy-events:
        method: POST # one of: GET, POST, PUT, PATCH. Default value: GET
        body: |
          {
            "trigger": "on-sync-succeeded",
            "app": "{{.app.metadata.name}}",
            "sync_status": "{{.app.status.sync.status}}",
            "health": "{{.app.status.health.status}}"
          }

  trigger.on-sync-succeeded: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [sync-succeeded-webhook]
```

Subscribe an application (or set the same annotation on the project):

```yaml
metadata:
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.deploy-events: ""
```

- The header **name is yours to choose**. The examples read it from `ARGO_CD_WEBHOOK_HEADER`
  (default `Authorization`) and the expected value from `ARGO_CD_WEBHOOK_SECRET`.
- `ARGO_CD_WEBHOOK_SECRET` is the **exact, whole header value**, including any `Bearer ` prefix you
  typed in the secret. The prefix is not parsed or stripped.
- `basicAuth` on the service sends `Authorization: Basic <base64(username:password)>` on every
  request. It works like a header: enter header name `Authorization` and the full `Basic <base64>`
  value in Hookdeck, and set `ARGO_CD_WEBHOOK_SECRET` to the same full value.
- The body goes out with **every method, GET included**: the notifications engine sends the
  template's `webhook.<name>.body` (or, with no `webhook` block, the notification `message`)
  whatever the method. Next.js App Router route handlers drop GET request bodies, so set
  `method: POST` in the template when using the Next.js example.

## Methods

The template chooses `GET`, `POST`, `PUT` or `PATCH`; the default is `GET`. The examples accept
`GET`, `POST`, `PUT`, `PATCH` and `DELETE` on the webhook route, check the credential first for
every method, read the body for GET too, and return `200` for an empty body. Hookdeck's Argo CD source pre-selects GET
and POST without managing the method, so if a template uses PUT or PATCH, allow that method on
the source too.

## Register Your Endpoint

1. Set `url` on the webhook service to your endpoint (or your Hookdeck source URL).
2. Add the header with the shared secret from `argocd-notifications-secret`.
3. Apply the ConfigMap and Secret, then subscribe an application with the annotation above.
4. Trigger a sync and check the delivery.

## Test Mode vs Live Mode

Argo CD has no test mode. Run a sync (or temporarily use a trigger whose `when` is `true`) on a
non-production application, or send a `curl` request with the header by hand.
