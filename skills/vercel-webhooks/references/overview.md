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

The dashboard offers an **Attack Detected** firewall event, which fires when the Vercel Firewall detects and mitigates a DDoS attack. The [Webhooks API reference](https://vercel.com/docs/webhooks/webhooks-api) doesn't document its `type` value or payload, so log the `type` you receive before you branch on it.

### Legacy Event Types

Hyphenated names such as `deployment-ready`, `deployment-error` and `project-created` are legacy events. Vercel still delivers them to webhooks that already listen for them, but new webhooks can't subscribe to them. Use the dotted names above instead.

## Event Payload Structure

All Vercel webhook events follow a standard structure:

```json
{
  "id": "<eventId>",
  "type": "<event-type>",
  "createdAt": 1700000000000,
  "payload": {},
  "region": "<RegionId>"
}
```

### Common Payload Fields

- `id`: The ID of the webhook delivery
- `type`: The event type (e.g., `deployment.created`)
- `createdAt`: JavaScript timestamp (milliseconds since epoch)
- `payload`: Event-specific data that varies by event type
- `region`: Vercel region where the event originated

### deployment.created Payload Fields

Vercel documents these keys for `deployment.created` (no example body is published):

- `payload.team.id` (possibly null) and `payload.user.id`
- `payload.alias`: aliases assigned when the deployment is ready
- `payload.deployment.id`, `payload.deployment.meta`, `payload.deployment.url`, `payload.deployment.name`
- `payload.links.deployment` and `payload.links.project`: dashboard URLs
- `payload.target`: `production`, `staging` or `null`
- `payload.project.id`, `payload.plan`, `payload.regions`

## Webhook Requirements

### Plan Requirements
- Available on Pro and Enterprise plans only
- Free plans do not have access to webhooks

### Limits
- Maximum of 20 custom webhooks per team
- Response timeout: 30 seconds
- Retry policy: Exponential backoff up to 24 hours for any non-2xx response, then the event is discarded

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