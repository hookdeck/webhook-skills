# Autosana Webhooks Overview

## What Are Autosana Webhooks?

Autosana (AI mobile app testing) sends an HTTP `POST` with a JSON body to your HTTPS endpoint when it completes a batch of flow runs, so your CI, chat or dashboards can react without polling. Webhooks are configured under Settings > Integrations > Webhooks.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `batch.completed` | A batch of flow runs completes | Post results to chat, gate a release, open a ticket for failed groups |

`batch.completed` is the only notification Autosana documents. The event name is the `event` field in the body (there is no event-type header), so dispatch on it and ignore unknown values.

## Event Payload Structure

```json
{
  "event": "batch.completed",
  "timestamp": "2025-01-31T12:34:56.789Z",
  "app": {
    "id": "com.example.myapp",
    "bundle_id": "com.example.myapp",
    "name": "My App",
    "platform": "android",
    "url": "https://.../my_app.apk"
  },
  "git": { "commit_sha": "a1b2c3d4e5f6g7h8i9j0", "branch": "main" },
  "summary": { "total_groups": 3, "passed_groups": 2, "failed_groups": 1 },
  "run_groups": [
    {
      "name": "Login Suite",
      "status": "passed",
      "url": "https://autosana.ai/runs/groups/f1e2d3c4-...",
      "runs": [
        { "name": "User can sign in with email", "status": "passed", "url": "https://autosana.ai/runs/flow/12345678-..." }
      ]
    }
  ]
}
```

- `git` is only present when the app build has git metadata (for example uploaded from CI/CD with commit info).
- `summary` counts run groups; each entry in `run_groups` carries its own `runs`.
- There is no delivery or event ID in the documented payload, so deduplicate on your own key (for example the group URLs plus `timestamp`).

## Delivery Notes

- Run-result webhooks come from the IPs listed as `flow_runners.virtual_runners.web_browsers` in Autosana's Network Allowlist, for every platform including mobile. The Test button sends from Autosana's API, which is not on that list.
- Respond with a 2xx quickly and process asynchronously.

## Full Reference

See [Autosana's webhook documentation](https://docs.autosana.ai/webhooks).
