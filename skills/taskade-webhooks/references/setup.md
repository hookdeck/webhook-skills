# Setting Up Taskade Webhooks

> Only webhooks registered through the Taskade public API (Pro plan and above) are supported. Legacy webhooks are unsigned and fail verification.

## Prerequisites

- Taskade account on the Pro plan or above
- A Taskade API token (for `POST /api/v2/webhooks`) or access to **Settings > API**
- An `https` endpoint URL of at most 2,048 characters (use the Hookdeck CLI for local development)

## Get Your Signing Secret

Registration returns a signing `secret` **exactly once**. Store it before anything else, as `TASKADE_WEBHOOK_SECRET`. If you lose it, register a new webhook.

## Register Your Endpoint

1. Register through the public API (`POST /api/v2/webhooks`) or in **Settings > API**.
2. Provide the target URL, the `events` to receive (`task.due`, `task.assigned`, `comment.created`, `project.created`, `project.assigned`, `project.joined`) and optional workspace scoping.
3. Copy the `secret` from the response.

Limits: up to 100 event-workspace combinations per account. The docs describe no retry or timeout behaviour.

Legacy webhooks are unsigned and will fail verification. Re-register them through the public API.

## Local Development

```bash
npx hookdeck-cli listen 3000 taskade --path /webhooks/taskade
```

Use the Hookdeck URL as the webhook target. In Hookdeck, create the source with the **Taskade** type and paste the same secret.

## Testing and Troubleshooting

Trigger one of the registered events in a scoped workspace (for example, assign a task). If verification fails, the usual causes are a lost or mistyped secret, a legacy (unsigned) webhook, or a body parsed before verification.
