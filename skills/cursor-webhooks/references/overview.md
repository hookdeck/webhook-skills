# Cursor Webhooks Overview

## What Are Cursor Webhooks?

Cursor Cloud Agent webhooks are HTTP callbacks that notify your application when agent status changes occur. These webhooks enable real-time monitoring of Cloud Agent operations, allowing you to track when agents complete tasks or encounter errors.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `statusChange` | Agent status changes to ERROR or FINISHED | Monitor agent completion, handle errors, update UI |

## Event Payload Structure

All Cursor webhooks share a consistent payload structure:

```json
{
  "event": "statusChange",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "id": "agent_123456",
  "status": "FINISHED",
  "source": {
    "repository": "https://github.com/user/repo",
    "ref": "main"
  },
  "target": {
    "url": "https://github.com/user/repo/pull/123",
    "branchName": "feature-branch",
    "prUrl": "https://github.com/user/repo/pull/123"
  },
  "summary": "Updated 3 files and fixed linting errors"
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
| `X-Webhook-ID` | Unique delivery ID | `msg_01234567890` |
| `X-Webhook-Event` | Event type | `statusChange` |
| `User-Agent` | Identifies Cursor webhooks | `Cursor-Agent-Webhook/1.0` |
| `Content-Type` | Payload format | `application/json` |

## Full Event Reference

For the complete list of events and detailed specifications, see [Cursor's webhook documentation](https://cursor.com/docs/cloud-agent/api/webhooks).