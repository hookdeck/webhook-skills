# LaunchDarkly Webhooks Overview

## What Are LaunchDarkly Webhooks?

LaunchDarkly webhooks let you subscribe to changes in your LaunchDarkly account. When something changes (a feature flag is updated, a member is invited, a project is created), LaunchDarkly sends an HTTP POST with a JSON body to the webhook's URL. Common uses: updating issue trackers, notifying support, announcing rollouts.

The payload is identical to an audit log (change history) entry. There is no separate event-type header; use the body's `kind` field.

## Common Event Types

| `kind` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `flag` | A feature flag changes (default webhook scope: flags in `production`) | Sync flag state, notify teams, update tickets |
| `segment` | A segment changes | Invalidate caches, audit targeting changes |
| `project` | A project changes | Inventory/audit |
| `environment` | An environment changes (e.g. `updateName`) | Audit, config sync |

Other kinds exist (the audit log covers more resource types); unknown kinds should be acknowledged with 200.

## Event Payload Structure

```json
{
  "_id": "57c0a8e29969090743529965",
  "date": 1472243938774,
  "accesses": [{ "action": "updateName", "resource": "proj/alexis:env/test" }],
  "kind": "environment",
  "name": "Testing",
  "description": "- Changed the name from ~~Test~~ to *Testing*",
  "member": { "_id": "548f6741c1efad40031b18ae", "email": "ariel@acme.com", "firstName": "Ariel", "lastName": "Flores" },
  "titleVerb": "changed the name of",
  "title": "[Ariel Flores](mailto:ariel@acme.com) changed the name of [Testing](...)",
  "target": { "name": "Testing", "resources": ["proj/alexis:env/test"] }
}
```

`accesses[].action` identifies the specific change (e.g. `updateName`, `createApprovalRequest`).

## Delivery Notes

- **Ordering is not guaranteed.** Use the payload's `date` (ms epoch) to reorder.
- **Retries:** a non-2xx response is retried once. Delivery is not guaranteed.
- **Signing is optional** (see [setup.md](setup.md)). Unsigned webhooks send no `X-LD-Signature`.
- Use `_id` for idempotency.

## Full Event Reference

See [LaunchDarkly webhooks](https://launchdarkly.com/docs/home/infrastructure/webhooks) and the [Webhooks API](https://launchdarkly.com/docs/api/webhooks).
