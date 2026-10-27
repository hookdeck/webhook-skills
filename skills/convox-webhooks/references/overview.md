# Convox Webhooks Overview

## What Are Convox Webhooks?

A Convox Rack emits an HTTP `POST` with a JSON body (`Content-Type: application/json`) for app-level events: app creation, the build and release lifecycle, budget caps, the auto-shutdown countdown, and scale and trigger overrides. Receivers (Slack, Discord, PagerDuty, your own endpoint) subscribe by URL, set per app in Console under App > Settings > Webhooks. Budget-cap events can also use the top-level `budget.atCapWebhookUrl` field in `convox.yml`. There is no per-service webhook URL.

Deliveries are signed with `Convox-Signature` when the `webhook_signing_key` Rack parameter is set (Rack 3.24.6 or later). See [verification.md](verification.md).

## How Are Webhooks Delivered?

- **Best-effort, fire-and-forget, never retried.** The Rack does not retry on a receiver-side 5xx.
- **Out of order:** two events fired in the same tick (for example `app:budget:set` then `app:budget:breaker-cleared`) are dispatched asynchronously and may arrive in either order. Order by the body's `timestamp`, not by arrival.
- **Duplicates:** a load balancer or proxy in front of you can deliver the same event twice. Dedupe on `data.tick_id` + `action`.
- **Timeout:** a plain URL receiver gets the default 30 second dispatch timeout. On 3.24.6+ the receiver config can be a JSON object with `url` and an optional `timeout` (Go duration such as `5s` or `1m`).
- **Not a queue:** the Console's Events tab holds the audit stream. Persist payloads yourself if you need replay.

## Event Payload Structure

Every payload has `action`, `status`, `timestamp` and `data` at the top level. Common fields live under `data`: `app`, `rack`, `actor` and, on tick-driven budget events, `tick_id`. `actor` is the authenticated identity for HTTP-handler events and `"system"` for accumulator-tick and render-time events. Ignore unknown actions and unknown fields.

```json
{
  "action": "app:budget:auto-shutdown:cancelled",
  "status": "success",
  "timestamp": "2026-04-27T10:30:00Z",
  "data": {
    "app": "myapp",
    "rack": "rack1",
    "actor": "alice@example.com",
    "tick_id": "tick-2026-04-27T10:30:00Z-3a7b4c2d8e9f4a6b8c4d3e2f1a0b9c8d",
    "cancel_reason": "reset-during-armed"
  }
}
```

`status` qualifies some events: `success` or `error` on `build:create` (with `data.message` carrying the build error), `start` on `release:promote`, `skipped` on `release:prometheus-skipped`.

## Event Types

These are the 35 actions Convox documents (as of Rack 3.24.6, plus later additions the docs mark). The examples handle `app:create`, `build:create`, `release:promote`, `app:budget:cap`, `app:budget:auto-shutdown:fired` and `app:budget:auto-shutdown:cancelled`, and log everything else.

### App lifecycle, builds and releases

| Action | Triggered when |
|--------|----------------|
| `app:create` | `convox apps create` succeeds |
| `build:create` | A build starts, and again on build failure (`status: "error"`) |
| `build:import-image:start` | `convox build import-image` starts |
| `build:import-image:done` | `convox build import-image` finishes |
| `build:cancel` | `convox builds cancel` deletes the build pod (Rack 3.25.7+) |
| `release:create` | A release is created from a successful build |
| `release:promote` | A promote starts (`status: "start"`) |
| `app:promote:completed` | The rollout watcher sees the promote finish |
| `app:promote:errored` | The rollout watcher sees the promote fail (`data.message` has the error) |
| `app:promote:cancelled` | The promote was superseded or cancelled (`data.message` has the detail) |
| `release:autoscale-disabled` | A service requests autoscale on a Rack without `keda_enable=true` |
| `release:manifest-advisory` | A service configuration is invalid at render time |
| `release:prometheus-skipped` | KEDA Prometheus trigger creation was skipped (`status: "skipped"`) |
| `release:imperative-patch-note` | `convox scale` patched a KEDA-managed service's ScaledObject |

### Budget cap and cost

| Action | Triggered when |
|--------|----------------|
| `app:budget:set` | `convox budget set` or a Console budget change |
| `app:budget:reset` | `convox budget reset` clears the circuit breaker |
| `app:budget:clear` | `convox budget clear` removes the budget config |
| `app:budget:threshold` | `alertThresholdPercent` is crossed |
| `app:budget:cap` | `monthlyCapUsd` is crossed |
| `app:budget:breaker-cleared` | A cap raise clears the `block-new-deploys` breaker |
| `app:budget:per-service-truncated` | The per-service breakdown exceeded its cap and entries were dropped |

### Scale and trigger overrides

| Action | Triggered when |
|--------|----------------|
| `app:scale-override:toggled` | The per-service scale override is switched on or off |
| `app:scale-override:honored` | A deploy preserved an active scale override |
| `app:triggers-override:toggled` | The per-service autoscaler override is switched on or off |
| `app:triggers-override:threshold-set` | A single trigger's threshold was edited |

### Auto-shutdown lifecycle

| Action | Triggered when |
|--------|----------------|
| `app:budget:auto-shutdown:armed` | The countdown begins |
| `app:budget:auto-shutdown:fired` | The countdown elapsed and services scaled to zero |
| `app:budget:auto-shutdown:cancelled` | An armed countdown was cancelled before `:fired` (`data.cancel_reason`) |
| `app:budget:auto-shutdown:restored` | Services were restored from the persisted shutdown state |
| `app:budget:auto-shutdown:expired` | Manual-mode month rollover with the user absent |
| `app:budget:auto-shutdown:flap-suppressed` | A cap fire was suppressed by the 24-hour cooldown |
| `app:budget:auto-shutdown:noop` | The reconciler decided no action was needed |
| `app:budget:auto-shutdown:failed` | Shutdown patch retries were exhausted |
| `app:budget:auto-shutdown:simulated` | `convox budget simulate-shutdown` was run |
| `app:budget:auto-shutdown:dismissed` | The recovery banner was dismissed |

`cancel_reason` is one of `reset-during-armed`, `cap-raised`, `manual-detected`, `config-changed` or `countdown-lapsed` (Rack 3.25.10+).

## Full Event Reference

For payload details of each event, see [Convox's webhook documentation](https://docs.convox.com/configuration/webhooks).
