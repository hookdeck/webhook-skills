# Vercel Webhooks Overview

## What Are Vercel Webhooks?

Vercel webhooks are HTTP POST requests that Vercel sends to your application when specific events occur in your Vercel projects, deployments, or team. They enable real-time notifications and automated workflows based on deployment status, project changes, and other platform events.

## Common Event Types

### Deployment Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `deployment.created` | A new deployment is initiated | Start deployment monitoring, notify team chat |
| `deployment.succeeded` | Deployment completes successfully | Trigger smoke tests, update external status |
| `deployment.ready` | Deployment is ready to receive traffic | Run end-to-end tests, warm up caches |
| `deployment.error` | Deployment fails to complete | Alert on-call team, create incident ticket |
| `deployment.canceled` | User cancels a deployment | Clean up temporary resources |
| `deployment.promoted` | Production deployment is promoted | Update feature flags, clear CDN cache |

### Project Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `project.created` | New project is created | Set up monitoring, create dashboards |
| `project.removed` | Project is deleted | Archive data, clean up resources |
| `project.renamed` | Project name changes | Update external references |
| `domain.created` | Domain is added to project | Configure DNS, update SSL certificates |

### Integration Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `integration-configuration.removed` | Integration is uninstalled | Clean up integration data |

### Security Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `attack.detected`* | Firewall detects attack (may require certain plans) | Security alerting, block IPs |

*Note: The `attack.detected` event may be limited to certain plan types or may require specific security features enabled. Check Vercel's current documentation for availability.

## Event Payload Structure

All Vercel webhook events follow a standard structure:

```json
{
  "id": "event_2XqF5example",
  "type": "deployment.created",
  "createdAt": 1698345600000,
  "payload": {
    // Event-specific data
  },
  "region": "sfo1"
}
```

### Common Payload Fields

- `id`: Unique identifier for this webhook event
- `type`: The event type (e.g., `deployment.created`)
- `createdAt`: JavaScript timestamp (milliseconds since epoch)
- `payload`: Event-specific data that varies by event type
- `region`: Vercel region where the event originated

### Example: deployment.created Payload

```json
{
  "id": "event_2XqF5example",
  "type": "deployment.created",
  "createdAt": 1698345600000,
  "payload": {
    "deployment": {
      "id": "dpl_FjHqKqFexample",
      "name": "my-app",
      "url": "https://my-app-git-main-team.vercel.app",
      "meta": {
        "githubCommitRef": "main",
        "githubCommitSha": "abc123def456",
        "githubCommitMessage": "Update homepage"
      }
    },
    "project": {
      "id": "prj_Qmexample",
      "name": "my-app"
    },
    "team": {
      "id": "team_Vexample",
      "name": "my-team"
    }
  }
}
```

## Webhook Requirements

### Plan Requirements
- Available on Pro and Enterprise plans only
- Free plans do not have access to webhooks

### Limits
- Maximum of 20 custom webhooks per team
- Response timeout: 30 seconds
- Retry policy: Exponential backoff up to 24 hours

### Endpoint Requirements
- Must accept POST requests
- Must be publicly accessible (not behind authentication)
- Should return 2xx status code to acknowledge receipt
- Should process webhooks asynchronously for long operations

## Best Practices

1. **Always verify signatures** - Ensure webhooks are from Vercel
2. **Handle events idempotently** - Same webhook might be delivered multiple times
3. **Return 200 quickly** - Process events asynchronously to avoid timeouts
4. **Log all events** - Helps with debugging and audit trails
5. **Handle unknown events** - New event types may be added

## Full Event Reference

For the complete and up-to-date list of webhook events, see [Vercel's webhook documentation](https://vercel.com/docs/webhooks).