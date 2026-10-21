# Nash Webhooks Overview

## What Are Nash Webhooks?

Nash ([usenash.com](https://www.usenash.com/), now nash.ai) orchestrates deliveries across
courier networks, local fleets and in-house drivers. Webhooks push real-time job, task,
courier and shift changes to your endpoint, so you don't poll for status. They work in both
sandbox and production, are delivered through [Svix](https://www.svix.com/), and are signed
(see [verification.md](verification.md)).

## What Does a Nash Webhook Payload Look Like?

Every payload has three fields:

| Field | Meaning |
|-------|---------|
| `type` | The entity: `delivery`, `task`, `courier_location`, `courier_name` or `shift` |
| `event` | The status within that entity (lists below) |
| `data` | For `delivery`, `task`, `courier_location` and `courier_name`: the full Job object, the same shape as the Create Job response. For `shift`: a small dispatch summary |

```json
{
  "type": "delivery",
  "event": "dropoff_enroute",
  "data": {
    "id": "job_R7FXJrfB99bpvpzf6CriJC",
    "isBatch": false,
    "portalUrl": "https://portal.usenash.com/active/job_R7FXJrfB99bpvpzf6CriJC",
    "jobConfigurations": [ { "tasks": [ { "status": "dropoff_enroute" } ] } ]
  }
}
```

Event schemas assume a batch job; for a non-batch job `data` has no `batch` key and
`"isBatch": false`. All timestamps are UTC ISO 8601 with microseconds and no timezone
suffix (for example `2022-03-05T01:11:51.078927`).

The skill's examples dispatch on `` `${type}.${event}` `` (for example `task.created`).

## Common Event Types

| Event (`type.event`) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| `delivery.created` | A delivery is created | Show "finding a courier" |
| `delivery.assigned_driver` | A courier is assigned | Show courier name and ETA, prepare the order |
| `delivery.dropoff_complete` | The delivery is completed | Close the order, read proof of delivery |
| `delivery.canceled_by_provider` | The provider cancels | Alert ops; Nash may reassign |
| `delivery.failed` | The delivery fails | Alert, refund or redispatch |
| `task.created` | A task (delivery attempt) is created, including after a reassignment | Track the live attempt |
| `task.canceled_by_provider` | The provider cancels a task | Mark that attempt terminal |
| `task.failed` | A task fails | Alert, check other tasks on the job |
| `courier_location.updated` | Every 1-2 minutes while location is available | Live map tracking |
| `courier_name.updated` | The same provider swaps drivers | Update courier details shown to the customer |
| `shift.dispatched` | A delivery window passes its cutoff and its orders are dispatched in bulk | Reconcile created jobs and errors |

## Full Event Lists

**`delivery`** (once per state transition): `created`, `not_assigned_driver`,
`assigned_driver`, `started`, `pickup_enroute`, `pickup_arrived`, `items_pick_update`,
`items_pick_complete`, `pickup_complete`, `dropoff_enroute`, `dropoff_arrived`,
`dropoff_complete`, `canceled_by_provider`, `return_in_progress`, `return_arrived`,
`returned`, `scheduled`, `expired`, `failed`, `canceled_by_customer`, `canceled_by_nash`,
`canceled_by_auto_reassign`, `proof_of_delivery`, `pincode_verification`, `pickup_label`,
`shipping_label` (shipping only), `manifested` (shipping only).

Guaranteed delivery events (may be inferred from later events): `created`,
`assigned_driver`, `pickup_enroute`, `pickup_arrived`, `dropoff_enroute`,
`dropoff_arrived`, `dropoff_complete`.

**`task`** (once per state transition): `created`, `updated`, `running`, `completed`,
`canceled_by_provider`, `failed`, `canceled_by_customer`, `canceled_by_nash`,
`canceled_by_auto_reassign`, `canceled_by_reassign`, `dispatch_failure`,
`planned_selection`, `refund_created`, `refund_updated`.

**`courier_location`**: `updated`. Once every 1-2 minutes; organizations with immediate
location webhooks get one per driver position, at most every 20 seconds per delivery.

**`courier_name`**: `updated`.

**`shift`**: `dispatched`.

## What Does shift.dispatched Contain?

```json
{
  "type": "shift",
  "event": "dispatched",
  "data": {
    "eventSourceId": "act_4mK8pN2wL9xQ",
    "created_job_ids": ["job_3nL7mK9pW2xQ", "job_6kM2nP8wL5yR"],
    "errors": {
      "ord_5xW9mL3kP7yN": "order_validation_error: Delivery address is incomplete"
    }
  }
}
```

`errors` maps order or job IDs to messages. A job that was created but failed provider
dispatch appears in `errors` under its `job_` ID, not in `created_job_ids`.

## How Do Reassignments Show Up?

- Reassignment (manual, auto-reassignment, or after a provider cancels) creates a **new
  task** on the same job. The old task emits its terminal event and the new one emits
  `task.created`. Both stay in `jobConfigurations[].tasks`; read
  `jobConfigurations[].advancedTask` for the live attempt.
- Once a quote is selected, task payloads carry only the winning quote in `quotes`;
  `failedQuotes` is never in a webhook payload.
- A courier change by the same provider is **not** a reassignment: you get
  `courier_name.updated` and the courier fields update in place.
- Each payload is a snapshot of the whole job when the change was saved. Events from the
  same change share one snapshot, so `task.created` already shows the old task as canceled.

## Best Practices from Nash

- A job can have several tasks, so expect the same event more than once (for example
  `pickup_arrived` from two providers). Don't let one task's failure disrupt the others.
- Some providers erroneously send `pickup_complete` or `dropoff_complete` early.
- Deduplicate on the `svix-id` header, which is stable across retries.

## Full Event Reference

See [Nash's webhook documentation](https://docs.usenash.com/reference/webhooks) and the
[shift.dispatched reference](https://docs.usenash.com/reference/shift-dispatched-event). The
**Event Catalog** tab in the Portal's Webhook Management page lists every schema.
