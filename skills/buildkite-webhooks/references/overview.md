# Buildkite Webhooks Overview

## What Are Buildkite Webhooks?

Buildkite pipeline webhooks send an HTTP POST with a JSON body to your URL when builds, jobs, or agents change state. You configure them under **Settings → Notification Services → Webhook** and choose which events, pipelines, queues, and branches trigger them. The last 20 requests and responses are kept on the webhook's settings page.

## Common Event Types

The event name is in the `X-Buildkite-Event` header and the `event` field of the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping` | Webhook notification settings change | Confirm the endpoint is reachable |
| `build.scheduled` | A build is scheduled | Track queued builds |
| `build.running` | A build starts running | Update dashboards, chat status |
| `build.failing` | A build is failing | Early failure alerts |
| `build.finished` | A build finishes | Deploy triggers, notifications (check `build.state`) |
| `job.started` | A command step job starts on an agent | Job timing, agent utilisation |
| `job.finished` | A job finishes | Collect results, per-job alerts |
| `agent.connected` | An agent connects to the API | Fleet monitoring |

Other events in the docs: `build.skipped`, `job.scheduled`, `job.activated`, `job.promised_exit_status`, `agent.lost`, `agent.disconnected`, `agent.stopping`, `agent.stopped`, `agent.blocked`, `cluster_token.registration_blocked`. Queue filtering applies only to job events.

## Event Payload Structure

```json
{
  "event": "build.finished",
  "build": { "id": "...", "state": "passed", "branch": "main" },
  "pipeline": { "slug": "..." },
  "sender": { "name": "..." }
}
```

Build events carry `build`, job events carry `job`, agent events carry `agent`. Keys vary by event, so read them defensively.

## Fast Transitions

If a build moves between states very quickly, the payload may show a later state than the one that triggered the event. Treat webhooks as a hint and fetch from the Buildkite API when exact state matters.

## Full Event Reference

See [Buildkite pipelines webhooks](https://buildkite.com/docs/apis/webhooks/pipelines).
