# Tailscale Webhooks Overview

## What Are Tailscale Webhooks?

Tailscale sends HTTPS POST requests to an endpoint you register in the admin console whenever
subscribed events happen in your tailnet (a node is created, a policy file changes, a key is about
to expire). Webhooks apply to the whole tailnet. Events usually arrive within a few seconds.
The endpoint must use HTTPS on port 80 or 443. Failed deliveries (3xx, 4xx, 5xx, or no response)
are retried hourly for up to 24 hours.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `nodeCreated` | Node was created | Inventory, onboarding automation |
| `nodeNeedsApproval` | Node needs approval (pre-approved nodes skip this) | Approval workflow |
| `nodeApproved` | Node was approved (pre-approved nodes don't emit it) | Close approval tickets |
| `nodeKeyExpiringInOneDay` | Node key expires in less than one day | Owner notifications |
| `nodeDeleted` | Node was deleted, including ephemeral nodes | Inventory cleanup |
| `policyUpdate` | Tailnet policy file updated | Audit access changes |
| `userCreated` | User was created | Account provisioning |
| `test` | **Send test event** was clicked | Endpoint check |

Other types: `exitNodeIPForwardingNotEnabled`, `subnetIPForwardingNotEnabled`, `nodeKeyExpired`,
`nodeNeedsSignature`, `nodeSigned`, `userApproved`, `userNeedsApproval`, `userRoleUpdated`,
`webhookUpdated`, `webhookDeleted` (the last two are always subscribed). `nodeAuthorized` and
`nodeNeedsAuthorization` are deprecated aliases of `nodeApproved` and `nodeNeedsApproval`.

## Event Payload Structure

The root is **always a JSON array**; multiple events may be batched in one request.

```json
[
  {
    "timestamp": "2022-09-21T13:59:02.949217-04:00",
    "version": 1,
    "type": "nodeCreated",
    "tailnet": "example.com",
    "message": "Node alice-workstation1.yak-bebop.ts.net created",
    "data": {
      "nodeID": "nFJw3SRKTM59",
      "deviceName": "alice-workstation1.yak-bebop.ts.net",
      "managedBy": "alice@example.com",
      "actor": "alice@example.com",
      "url": "https://console.tailscale.com/admin/machines/100.12.345.67"
    }
  }
]
```

`data` is optional (`null` on `test`). Most events carry `data.actor`. There is no event ID field,
so build idempotency keys from `type` + `timestamp` + identifying `data` fields (e.g. `nodeID`).

## Full Event Reference

See [Tailscale's webhook documentation](https://tailscale.com/kb/1213/webhooks).
