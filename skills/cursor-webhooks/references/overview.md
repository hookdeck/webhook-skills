# Cursor Webhooks Overview

## What Are Cursor Webhooks?

Cursor Cloud Agent webhooks are HTTP POST callbacks that notify your application when an agent you created through the API reaches `FINISHED` or `ERROR`. A webhook is set per agent with the `webhook` object on the legacy v0 Create An Agent request; the current Cloud Agents API lists webhooks as coming soon. These webhooks enable real-time monitoring of Cloud Agent operations, allowing you to track when agents complete tasks or encounter errors.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `statusChange` | Agent status changes to ERROR or FINISHED | Monitor agent completion, handle errors, update UI |

## Event Payload Structure

Cursor's documented example (some fields are optional and only included when available):

```json
{
  "event": "statusChange",
  "timestamp": "2024-01-15T10:30:00Z",
  "id": "bc_abc123",
  "status": "FINISHED",
  "source": {
    "repository": "https://github.com/your-org/your-repo",
    "ref": "main"
  },
  "target": {
    "url": "https://cursor.com/agents?id=bc_abc123",
    "branchName": "cursor/add-readme-1234",
    "prUrl": "https://github.com/your-org/your-repo/pull/1234"
  },
  "summary": "Added README.md with installation instructions"
}
```

### Status Values

- `FINISHED` - Agent completed successfully
- `ERROR` - Agent encountered an error

## HTTP Headers

Cursor sends these headers with every webhook:

| Header | Description | Example |
|--------|-------------|---------|
| `X-Webhook-Signature` | HMAC-SHA256 signature | `sha256=abc123...` |
| `X-Webhook-ID` | Unique ID for this delivery, useful for logging (whether a retry reuses it isn't documented) | |
| `X-Webhook-Event` | Event type | `statusChange` |
| `User-Agent` | Identifies Cursor webhooks | `Cursor-Agent-Webhook/1.0` |

## Full Event Reference

For the complete list of events and detailed specifications, see [Cursor's webhook documentation](https://cursor.com/docs/cloud-agent/api/webhooks).