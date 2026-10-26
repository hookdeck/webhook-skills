# Pulumi Webhooks Overview

## What Are Pulumi Webhooks?

Pulumi Cloud (pulumi.com) is the hosted service for Pulumi infrastructure as code. A webhook sends an HTTP POST to your URL when something happens to a stack, a deployment, drift detection or a policy pack, so you can notify a team, open a ticket, or trigger follow-up automation. This skill covers the generic JSON webhook format. The deliveries are signed only if you set a shared secret on the webhook.

## Common Event Types

The kind of event is in the `Pulumi-Webhook-Kind` header; the body has no event-name field.

| Event (`Pulumi-Webhook-Kind`) | Triggered When | Common Use Cases |
|-------------------------------|----------------|------------------|
| `stack` | A stack is created or deleted (`action`) | Inventory sync, audit trail |
| `stack_update` | An update, refresh, destroy or similar run finishes (`kind`, `result`) | Notify on failure, post the `updateUrl` |
| `stack_preview` | A preview finishes (`isPreview: true`) | Pull request feedback |
| `deployment` | A Pulumi Deployments run changes state (`status`) | Track deployment progress |
| `drift_detection` | A drift detection run completes (`status`, `driftDetected`) | Alert when infrastructure has drifted |
| `drift_remediation` | A drift remediation run completes (`status`) | Confirm that drift was corrected |
| `policy_violation` | A policy pack is violated | Compliance alerts |

### Subscription filters vs what is sent

In Pulumi Cloud you subscribe to 21 filters such as `update_succeeded` and `deployment_failed`. They are not on the wire as such. They decide which deliveries you receive; the body then says what happened within the kind:

- `stack_update` and `stack_preview`: `kind` (the operation) and `result` (`succeeded` or `failed`)
- `deployment`, `drift_detection`, `drift_remediation`: `status`
- `stack`: `action`

## Event Payload Structure

Common fields (from the examples in Pulumi's docs):

```json
{
  "user": { "name": "Morty Smith", "githubLogin": "morty", "avatarUrl": "https://crazy-adventures.net/morty.png" },
  "organization": { "name": "Crazy Adventures", "githubLogin": "crazy-adventures", "avatarUrl": "https://crazy-adventures.net/logo.png" },
  "projectName": "website",
  "stackName": "website-prod"
}
```

Plus per kind, for example `stack_update`:

```json
{
  "updateUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/updates/42",
  "kind": "refresh",
  "result": "succeeded",
  "resourceChanges": { "update": 3, "delete": 1, "update-replace": 2 },
  "isPreview": false
}
```

`deployment` carries `deploymentUrl`, `version`, `operation` and `status`; `drift_detection` carries `driftDetected`, `driftRunId`, `status`, `resourceChanges` and `referenceUrl`; `drift_remediation` carries `status`, `resourceChanges` and `referenceUrl`; `stack` carries `action`.

## Delivery

- Order is not guaranteed.
- Pulumi Cloud records recent deliveries. A delivery whose endpoint returned non-2xx or did not respond counts as failed, and can be redelivered unchanged from the console (or the CLI for stack webhooks).
- No automatic retry is described, so respond `2xx` quickly and make handlers idempotent.

## Full Event Reference

For the complete list of kinds, filters and payloads, see [Pulumi's webhook documentation](https://www.pulumi.com/docs/deployments/concepts/webhooks/).
