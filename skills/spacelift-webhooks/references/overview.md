# Spacelift Webhooks Overview

## What Are Spacelift Webhooks?

Spacelift is an IaC orchestration platform. A **named webhook** (Integrations -> Webhooks) is an endpoint URL, an optional secret and optional extra headers. Spacelift sends it the messages that **notification policies** route to it. Two kinds of message exist: run state changes and internal errors. Per-stack webhooks are kept for backwards compatibility. Paid accounts only.

Spacelift doesn't name the HTTP method in its docs. Hookdeck's Spacelift source pre-selects POST without managing the method, so allow any other method the sender uses on the source too.

## Message Types

There is no event-name field or header, so the skill and examples use these names for the two documented payload shapes:

| Name | Shape | Triggered When |
|------|-------|----------------|
| `run` | `account`, `state`, `stateVersion`, `timestamp`, `run`, `stack` | A run changes state (e.g. `FINISHED`) |
| `internal_error` | `title`, `body`, `error`, `severity`, `account` | Spacelift reports an internal error, e.g. a policy triggered a stack that doesn't exist |

## Run Payload

```json
{
  "account": "spacelift-io",
  "state": "FINISHED",
  "stateVersion": 4,
  "timestamp": 1596979684,
  "run": {
    "id": "01EF9PFPNFFM2MQXTJKHK1B869",
    "branch": "master",
    "commit": { "hash": "0ee3a3b7...", "message": "Update demo.tf", "authorLogin": "marcinwyszynski" },
    "createdAt": 1596979665,
    "delta": { "added": 0, "changed": 0, "deleted": 0, "resources": 1 },
    "triggeredBy": "marcinw@spacelift.io",
    "type": "TRACKED"
  },
  "stack": { "id": "spacelift-demo", "name": "Spacelift demo", "description": "", "labels": [] }
}
```

Updates can arrive out of order. Use `stateVersion` to order updates for a run.

## Internal Error Payload

```json
{
  "title": "Invalid Stack Slug Triggered",
  "body": "policy tried to trigger Stack 'this-is-not-a-stack' which either doesn't exist or this policy doesn't have access to",
  "error": "policy triggered for Stack that doesn't exist",
  "severity": "ERROR",
  "account": "spacelift-io"
}
```

The payload is the default one; a notification policy can shape what is sent.

## Delivery

- Optional **Retry on failure**: up to 3 retries, only on `5xx` responses.
- Auto-disabled after 10 or more consecutive failures; re-enable by hand.
- Deliveries and their status codes are viewable per webhook.

## Full Reference

[Spacelift webhooks documentation](https://docs.spacelift.io/integrations/webhooks)
