# Setting Up Flux CD Webhooks

## Setup note

Use a Flux Provider of type generic-hmac and paste the token from its Secret. Generic providers are unsigned and fail verification.

## Prerequisites

- A Kubernetes cluster running Flux with the notification-controller
- `kubectl` access to create a Secret, Provider and Alert
- Your application's public webhook endpoint URL (use the Hookdeck URL from `npx hookdeck-cli listen 3000 flux-cd --path /webhooks/flux-cd` while developing)

## Get Your Signing Secret

Flux has no dashboard. You choose the secret and store it under the `token` key of a Kubernetes Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: webhook-token
  namespace: default
stringData:
  token: <a long random string>
```

That `token` value is your `FLUX_CD_WEBHOOK_SECRET`. Use it as UTF-8 text; do not hex- or base64-decode it.

## Register Your Endpoint

Create a Provider with `type: generic-hmac` and an Alert that selects what to send:

```yaml
apiVersion: notification.toolkit.fluxcd.io/v1
kind: Provider
metadata:
  name: webhook
  namespace: default
spec:
  type: generic-hmac
  address: https://example.com/webhooks/flux-cd
  secretRef:
    name: webhook-token
---
apiVersion: notification.toolkit.fluxcd.io/v1
kind: Alert
metadata:
  name: webhook
  namespace: default
spec:
  providerRef:
    name: webhook
  eventSeverity: info   # info sends info and error; error sends errors only
  eventSources:
    - kind: Kustomization
      name: '*'
    - kind: HelmRelease
      name: '*'
```

Apply with `kubectl apply -f`. Each event the Alert selects becomes one POST to `address` with an `X-Signature: sha256=<hex>` header.

## Test Mode vs Live Mode

There is no test mode. To test, trigger a reconciliation (for example `flux reconcile kustomization <name>`) and watch the request in the Hookdeck CLI web UI. A Provider of type `generic` sends no signature, so verification fails; switch it to `generic-hmac`.
