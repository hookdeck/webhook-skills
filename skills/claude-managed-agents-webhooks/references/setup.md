# Setting Up Claude Managed Agents Webhooks

## Prerequisites

- An Anthropic workspace with Claude Managed Agents access
- Workspace permission to manage webhooks
- A publicly resolvable HTTPS endpoint (port 443) for production use

## Register an Endpoint

1. Sign in to the [Anthropic Console](https://platform.claude.com/settings/workspaces/default/webhooks) and open **Manage → Webhooks**.
2. Click **Add endpoint** and configure:
   - **URL**: Your webhook receiver (must be HTTPS on port 443 with a publicly resolvable hostname; private IPs are rejected).
   - **Event types**: Pick the `data.type` values you want to receive. The endpoint only receives events it's subscribed to, plus test events.
   - **Description** (optional): Free-text label for your reference.
3. Save the endpoint.

## Get Your Signing Secret

On creation, the Console displays a 32-byte `whsec_`-prefixed signing secret **once**. Copy it immediately and store it securely:

```bash
ANTHROPIC_WEBHOOK_SIGNING_KEY=whsec_a1b2c3...
```

The secret is the source of truth for verifying every delivery. If you lose it, rotate the endpoint to issue a new one.

## Choose Your Events

Subscribe only to the events you actually handle to keep delivery volume low.

**Common subscriptions:**

- **Session lifecycle**: `session.status_run_started`, `session.status_idled`, `session.status_terminated`
- **Multiagent threads**: `session.thread_created`, `session.thread_idled`, `session.thread_terminated`
- **Outcome metrics**: `session.outcome_evaluation_ended`
- **Vault audit**: `vault.created`, `vault.archived`, `vault.deleted`
- **Credentials**: `vault_credential.created`, `vault_credential.archived`, `vault_credential.deleted`, `vault_credential.refresh_failed`

For the full list, see [references/overview.md](overview.md).

## Test Your Endpoint

Use the Console's **Send test event** button to push a synthetic event of any subscribed type. The signature header is computed against your real signing secret, so a test delivery exercises your verification path end-to-end.

For local development, point the endpoint at a tunnel:

```bash
# No account required
npx hookdeck-cli listen 3000 claude-managed-agents --path /webhooks/claude-managed-agents
```

Use the public URL Hookdeck prints as the endpoint URL in Console.

## Production Requirements

- **HTTPS on port 443** with a public hostname. Private IPs cause the endpoint to be auto-disabled immediately.
- **No redirects.** A `3xx` response counts as a failure. If your endpoint moves, update the URL in Console.
- **Respond fast.** Return `2xx` quickly; offload long work to a queue.
- **Idempotency.** Retries carry the same top-level `event.id` — dedupe by it.
- **Auto-disable** triggers after ~20 consecutive failures. Re-enable manually after fixing the issue.

## Rotating the Secret

Open the endpoint in Console, generate a new secret, deploy it to your environment as `ANTHROPIC_WEBHOOK_SIGNING_KEY`, then revoke the old one. Plan a short overlap if your deploy isn't atomic — verification fails if the secret used to sign doesn't match the secret your handler is checking against.
