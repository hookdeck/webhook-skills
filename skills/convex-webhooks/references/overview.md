# Convex Webhooks Overview

## What Are Convex Webhooks?

Convex's only outbound webhook is the **webhook log stream**, available on the Pro plan. A log stream pipes events from a deployment (function executions, `console` output, audit log, usage and scheduler stats) to a destination: Axiom, Datadog, PostHog, or a custom webhook URL. The webhook stream is the simplest and most generic: Convex POSTs a request to your URL, and the only setting is the URL.

## How Is Delivery Done?

- The body is a **JSON array of events** (JSONL streams send one JSON object per line instead).
- Delivery is **best effort**: logs are buffered in memory and sent in batches, so events can be dropped under high throughput, and duplicated by network retries.
- Log streams configured before May 23, 2024 use a legacy event format; recreate the stream to get the format below.
- A `verification` event is sent to confirm the stream works.

## Event Topics

Every event has `topic` (string), `timestamp` (Unix epoch milliseconds) and `convex` (deployment metadata: `deployment_name`, `deployment_type`, `project_name`, `project_slug`).

| Topic | Triggered When | Key fields |
|-------|----------------|------------|
| `verification` | The stream is created, to confirm it works | `message` |
| `console` | A function calls the `console` API | `function`, `log_level` (`DEBUG`/`INFO`/`LOG`/`WARN`/`ERROR`), `message`, `is_truncated` |
| `function_execution` | Any function runs | `function`, `execution_time_ms`, `status` (`success`/`failure`), `error_message`, `usage` |
| `audit_log` | A deployment change (also in the dashboard History tab) | `audit_log_action`, `audit_log_metadata` (stringified JSON) |
| `concurrency_stats` | Once a minute, when stats changed | `query`, `mutation`, `action`, `node_action`, `http_action` (`num_running`, `num_queued`) |
| `scheduler_stats` | Periodically from the scheduler | `lag_seconds`, `num_running_jobs` |
| `current_storage_usage` | Periodically | `total_document_size_bytes`, `total_index_size_bytes`, `total_file_storage_bytes`, ... |
| `storage_api_bandwidth` | A client downloads a file from the storage HTTP API | `storage_id`, `egress_bytes` |
| `ai_gateway_usage` | An AI Gateway inference ends | `inference_id`, `provider`, `model`, `cost`, `outcome` |

`function` (on `console` and `function_execution`) has `type` (`query`, `mutation`, `action`, `http_action`), `path` (for example `messages:send`), `request_id` and optionally `cached`.

## Example Batch

```json
[
  {"topic": "console", "timestamp": 1715879172882,
   "function": {"path": "messages:send", "request_id": "d064ef901f7ec0b7", "type": "mutation"},
   "log_level": "LOG", "message": "'Sent message!'"},
  {"topic": "audit_log", "timestamp": 1714421999886,
   "audit_log_action": "push_config", "audit_log_metadata": "{...}"}
]
```

## Full Event Reference

See [Convex log streams](https://docs.convex.dev/production/integrations/log-streams) for the complete schema of every topic.
