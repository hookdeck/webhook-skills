# Flux CD Webhooks Overview

## What Are Flux CD Webhooks?

Flux CD is the CNCF GitOps toolkit for Kubernetes. Its notification-controller forwards events from Flux objects (Kustomizations, HelmReleases, sources) through an `Alert` to a `Provider`. A Provider of `.spec.type` `generic` or `generic-hmac` POSTs each Event as JSON to `.spec.address`. Flux is self-hosted, so every cluster is its own sender, and the signing secret is whatever the cluster operator chose.

Only the `generic-hmac` type signs requests (`X-Signature`). Plain `generic` sends no signature.

Delivery: one POST per Event that the Alert selects (by event source and severity). The Provider docs do not describe retries.

## Event Types

There is no event-name field or header. Branch on `severity` and `reason`.

| `severity` | Triggered When | Example `reason` |
|------------|----------------|------------------|
| `error` | A Flux object fails to reconcile or validate | `ValidationFailed` |
| `info` | A Flux object makes normal progress | `ReconciliationSucceeded` |

`severity` is what an `Alert` filters on (`eventSeverity: info` or `error`). `reason` is controller-specific; `ValidationFailed` comes from the Flux docs, the other values are examples of what controllers report, so treat `reason` as an open set.

## Event Payload Structure

Fields of the JSON Event (from the Flux docs):

| Field | Description |
|-------|-------------|
| `involvedObject` | Metadata of the object that raised the event: `apiVersion`, `kind`, `name`, `namespace`, `uid` |
| `severity` | `info` or `error` |
| `reason` | Short machine-readable cause, e.g. `ValidationFailed` |
| `message` | Human-readable detail |
| `metadata` | Extra key/values, e.g. `kustomize.toolkit.fluxcd.io/revision` |
| `reportingController` | e.g. `kustomize-controller` |
| `reportingInstance` | Pod name of the reporting controller |
| `timestamp` | RFC 3339 time of the event |

Example:

```json
{
  "involvedObject": {
    "apiVersion": "kustomize.toolkit.fluxcd.io/v1",
    "kind": "Kustomization",
    "name": "webapp",
    "namespace": "apps",
    "uid": "7d0cdc51-ddcf-4743-b223-83ca5c699632"
  },
  "metadata": {
    "kustomize.toolkit.fluxcd.io/revision": "main/731f7eaddfb6af01cb2173e18f0f75b0ba780ef1"
  },
  "severity": "error",
  "reason": "ValidationFailed",
  "message": "service/apps/webapp validation error: spec.type: Unsupported value: Ingress",
  "reportingController": "kustomize-controller",
  "reportingInstance": "kustomize-controller-7c7b47f5f-8bhrp",
  "timestamp": "2022-10-28T07:26:19Z"
}
```

The request also carries a `Gotk-Component` header naming the sending controller.

## Full Event Reference

See the [Flux notification Provider documentation](https://fluxcd.io/flux/components/notification/providers/).
