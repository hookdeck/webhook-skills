# Sohar Health Webhooks Overview

## What Are Sohar Health Webhooks?

[Sohar Health](https://soharhealth.com) is an insurance eligibility-verification and patient-intake
API for behavioral-health providers. Webhooks notify your application when a verification, a
discovery request or a Flow Run changes state, so you don't have to poll. Sohar Health delivers
them through [Svix](https://www.svix.com/), and every delivery is signed (see
[verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body over HTTPS |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Respond `200 OK` to acknowledge receipt |
| Delivery | No retry schedule, timeout or ordering guarantee is stated in Sohar Health's docs |

Don't hard-code a retry schedule or assume event order. Deduplicate on `svix-id` (the same on
every retry of a message) and, for resource updates, on the resource id plus `status`.

## Common Event Types

The docs list ten events. Each production event has a `sandbox.` twin that fires for sandbox
credentials; any endpoint can subscribe to both, even though webhooks are managed with production
credentials. The docs say the list may grow, so acknowledge unknown events with `200`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `verification.updated` | A production verification has been completed | Read the result (e.g. `complete.eligible`) and fetch the verification |
| `sandbox.verification.updated` | A sandbox verification has been completed | Testing; the recommended first subscription |
| `verification.pending` | A production verification was not resolved immediately | Show a "checking coverage" state |
| `sandbox.verification.pending` | A sandbox verification was not resolved immediately | Testing |
| `discovery.updated` | A discovery request is updated | Fetch discovered coverage |
| `sandbox.discovery.updated` | A sandbox discovery request is updated | Testing |
| `flow.updated` | The status or state of a Flow Run is updated | Track Flow progress |
| `sandbox.flow.updated` | The status or state of a sandbox Flow Run is updated | Testing |
| `flow.callback` | A Flow Run reaches a callback state and waits for input | Collect and submit the requested input |
| `sandbox.flow.callback` | A sandbox Flow Run reaches a callback state | Testing |

## Event Payload Structure

Bodies are flat: a top-level `event`, the resource id, and a few fields. `status` is the
resource's state, not the event type.

```json
{
  "event": "verification.updated",
  "verificationId": "990cdad8-1438-4bbd-8b55-120b56e87540",
  "id": "123456",
  "status": "complete.eligible"
}
```

| Event family | Fields (from the docs' examples) |
|--------------|----------------------------------|
| `verification.updated`, `verification.pending` | `event`, `verificationId`, `id`, `status` (`complete.eligible` / `pending` in the examples) |
| `discovery.updated` | `event`, `discoveryId`, `status` (`complete`), `id` |
| `flow.updated` | `event`, `flowRunId`, `flowId`, `status` (`COMPLETE`, `ERROR`), `stateId` |
| `flow.callback` | `event`, `flowRunId`, `input` (a JSON Schema describing the input the Flow needs); no `status` |

The same shapes apply to the `sandbox.` events. The docs don't define `id` beyond showing a
short value such as `"123456"`.

## Delivery Rules Worth Planning For

- **Verify before acting.** Use the raw request body; the docs warn that "even minor changes can
  invalidate the cryptographic signature".
- **Treat the payload as a notification.** It carries ids and a status, so fetch the full
  verification, discovery or Flow Run from the API before acting on it.
- **Acknowledge with 200** and do slow work asynchronously.
- **Handle both environments.** The same endpoint can receive `sandbox.*` events; branch on
  the event name so sandbox data never touches production records.

## Full Reference

See Sohar Health's [webhooks introduction](https://docs.soharhealth.com/documentation/webhooks/introduction),
[event types](https://docs.soharhealth.com/documentation/webhooks/events) and
[security](https://docs.soharhealth.com/documentation/webhooks/security) pages.
