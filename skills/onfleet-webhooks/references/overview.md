# Onfleet Webhooks Overview

## What Are Onfleet Webhooks?

Onfleet sends webhooks when something happens in your delivery operation: a
driver starts a task, gets close to the destination, completes or fails a
delivery, goes on duty, or a route plan changes.

Every webhook targets **exactly one trigger**. To receive several triggers, you
create several webhooks (they can share a URL). Each event is a signed `POST`
with an `X-Onfleet-Signature` header. See [verification.md](verification.md).

Before a webhook is saved, Onfleet validates the URL with an unsigned
`GET ?check=<random_string>`. See [setup.md](setup.md).

## Triggers

| ID | `triggerName` | Fires when | `data` |
|---|---|---|---|
| 0 | `taskStarted` | A driver starts a task | `task` |
| 1 | `taskEta` | Driver ETA is at or below `threshold` **seconds** (at most once every 30 seconds) | `task` |
| 2 | `taskArrival` | Driver is at or within `threshold` **meters** (at most once every 30 seconds) | `task` |
| 3 | `taskCompleted` | A task is completed successfully | `task` |
| 4 | `taskFailed` | A task is completed as failed | `task` |
| 5 | `workerDuty` | A driver goes on or off duty | `worker` |
| 6 | `taskCreated` | A task is created (not for dashboard imports or clones) | `task` |
| 7 | `taskUpdated` | A task is updated | `task` |
| 8 | `taskDeleted` | A task is deleted | `task` |
| 9 | `taskAssigned` | A task is assigned to a driver or team | `task` |
| 10 | `taskUnassigned` | A task is unassigned | `task` |
| 12 | `taskDelayed` | Task delay is at or above `threshold` **seconds** (once per active task) | `task` |
| 13 | `taskCloned` | A task is cloned | `task` |
| 14 | `smsRecipientResponseMissed` | A recipient's SMS reply was missed | `{}` |
| 15 | `workerCreated` | A driver is created | `worker` |
| 16 | `workerDeleted` | A driver is deleted | `worker` |
| 17 | `SMSRecipientOptOut` | A recipient opts out of SMS | `{}` |
| 18 | `autoDispatchJobCompleted` | An auto-dispatch job finishes | dispatch and routes |
| 19 | `taskBatchCreateJobCompleted` | A batch task-create job finishes | results at the top level |
| 20 | `routeOptimizationJobCompleted` | A route optimisation job finishes | dispatch and optimised routes |
| 22 | `routePlanCreated` | A route plan is created | `routePlan`, `worker` |
| 23 | `routePlanStarted` | A route plan is started | `routePlan`, `worker` |
| 24 | `routePlanCompleted` | A route plan is completed | `routePlan`, `worker` |
| 25 | `workerUpdated` | A driver is updated | `worker` |
| 26 | `routePlanUpdated` | A route plan is updated | `routePlan`, `worker` |
| 27 | `routePlanUnassigned` | A route plan is unassigned | `routePlan`, `worker` |
| 28 | `routePlanAssigned` | A route plan is assigned | `routePlan`, `worker` |
| 29 | `routePlanDelayed` | A route plan is delayed | `routePlan`, `worker` |
| 30 | `predictedTaskDelay` | Predicted delay is at or above `threshold` **seconds** (assigned tasks, evaluated when queued tasks start) | `task` |

IDs **11 and 21 aren't documented**. Don't assume they're free or reserved.

Triggers 1, 2 and 12 are limited to 10 webhooks each.

### `predictedTaskDelay` vs `taskPredictedDelay`

The trigger table calls trigger 30 `predictedTaskDelay`. The published sample
payload for it carries `"triggerName": "taskPredictedDelay"`. Handle both names,
or route on `triggerId === 30`. The examples do both.

## Payload Shape

Every payload is a **flat JSON object**. There's no envelope: the trigger
metadata and the event fields sit side by side at the top level.

```json
{
  "actionContext": { "id": "vjw*RDMKDljKVDve1Vtcplgu", "type": "ADMIN" },
  "adminId": "vjw*RDMKDljKVDve1Vtcplgu",
  "data": {
    "task": {
      "id": "txiK2xHBIaUwAKB~BJrjscKu",
      "shortId": "fab829cf",
      "state": 1,
      "container": { "type": "WORKER", "worker": "COwfwH~Zogm1LXIZYbPlLAyw" },
      "destination": { "location": [-117.8764687, 33.8078476] },
      "metadata": []
    }
  },
  "taskId": "txiK2xHBIaUwAKB~BJrjscKu",
  "time": 1613002584051,
  "triggerId": 6,
  "triggerName": "taskCreated",
  "workerId": null
}
```

(Trimmed from Onfleet's `taskCreated` sample.)

Things to expect:

- **`time`, `triggerId` and `triggerName` are always present.** Route on them.
- **Fields that don't apply to a trigger arrive as `null`**, not absent. For
  example, `workerId` is `null` on `taskCreated`.
- **`data` can be `{}`.** SMS triggers put their fields at the top level
  (`recipient`, `SMS`, `timestamp`, or `from`, `to`, `body`) and leave `data` empty. Use
  optional access (`?.`, `or {}`) everywhere.
- **Ids are opaque strings** containing `~` and `*`. Don't URL-decode or
  validate them as alphanumeric.
- **Locations are `[longitude, latitude]`**, GeoJSON order.

### Trigger-specific top-level fields

| Trigger | Fields |
|---|---|
| `taskEta` | `etaSeconds`: **seconds**, fractional |
| `taskArrival` | `distance`: meters |
| `taskDelayed` | `delay`: seconds |
| `workerDuty` | `status`: `0` off duty, `1` on duty |
| `SMSRecipientOptOut` | `recipient` (`id`, `name`), `SMS`, `timestamp` |
| `smsRecipientResponseMissed` | `from`, `to`, `body` |
| `taskBatchCreateJobCompleted` | `jobId`, `status`, `tasksReceived`, `tasksCreated`, `tasksErrored`, `errors`, `failedTasks`, `newTasks` |
| `autoDispatchJobCompleted`, `routeOptimizationJobCompleted` | `dispatchId` |
| `routePlan*` | `routePlanId` |

## Units

All time fields are **milliseconds** (`time`, task timestamps), except
`etaSeconds` and `delay`, which are **seconds**. `etaSeconds` is fractional.
Mixing these up is easy: `etaSeconds: 284.5` is just under five minutes.

## Delivery Behaviour

- **Timeout:** Onfleet waits 10 seconds for a response.
- **Retries:** Timed-out requests are retried every 30 seconds.
- **Disabling:** After 300 consecutive failed requests, Onfleet disables the
  webhook.

Acknowledge with `200` straight after verification and do the work afterwards.
Retries can deliver the same event twice, so make handlers idempotent.

## Full Event Reference

- [Webhooks and triggers](https://docs.onfleet.com/reference/webhooks)
- [Webhook payload examples](https://docs.onfleet.com/reference/webhook-payload-examples)
