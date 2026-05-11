# Setting Up Linear Webhooks

## Prerequisites

- A Linear workspace where you have admin permissions
- Your application's webhook endpoint URL (HTTPS required for production)

## Create the Webhook

Linear webhooks are configured per workspace via the API settings page.

1. Open Linear and go to **Workspace settings** → **API** → **Webhooks**
2. Click **Create new webhook**
3. Configure the webhook:
   - **Label** — A human-readable name (e.g. "Production sync")
   - **URL** — Your endpoint (e.g. `https://your-app.com/webhooks/linear`)
   - **Resource types** — Select the entity types you want to receive (Issue, Comment, Project, Cycle, IssueLabel, …)
   - **Public team** — Optional: limit the webhook to a specific team
4. Click **Create webhook**

## Copy the Signing Secret

Linear displays the **signing secret only once** immediately after creating the webhook. Copy it to your environment **before navigating away**:

```bash
# .env
LINEAR_WEBHOOK_SECRET=your_signing_secret_here
```

If you lose the secret, delete and recreate the webhook to get a new one.

## OAuth App Webhooks

If you are building a Linear OAuth application, webhooks can also be enabled in your OAuth app settings under **Workspace settings** → **API** → **Applications** → *your app* → **Webhooks**. The signing secret model is the same.

## Recommended Resource Types by Use Case

**Issue triage / external sync:**
- `Issue`
- `Comment`
- `IssueLabel`

**Project / portfolio reporting:**
- `Project`
- `ProjectUpdate`
- `Initiative`
- `InitiativeUpdate`

**Sprint dashboards:**
- `Cycle`
- `Issue`

**SLA paging & escalation:**
- `IssueSLA`
- `Issue`

## Test Webhook Delivery

After creating the webhook, you can:

1. Trigger a test event by creating, updating, or deleting an issue in Linear
2. Visit **Workspace settings → API → Webhooks → *your webhook*** to see recent deliveries and their HTTP status codes
3. Re-deliver a failed delivery from the same page

## Local Development

To receive webhooks on your laptop without deploying, use the Hookdeck CLI:

```bash
# Forward to a local server on port 3000
npx hookdeck-cli listen 3000 linear --path /webhooks/linear
```

Hookdeck prints a public URL — paste it as the **URL** when creating the webhook in Linear. No Hookdeck account is required.

## Full Documentation

For Linear's official setup guide, see the [Linear webhooks documentation](https://linear.app/developers/webhooks).
