# Setting Up Langfuse Webhooks

## Prerequisites

- A Langfuse project (Langfuse Cloud or self-hosted) with permission to manage prompt automations
- A public HTTPS endpoint for your handler (use the Hookdeck CLI during development)

## How Do I Get the Signing Secret?

Langfuse shows the secret **when you create the webhook**; you can regenerate it later. Copy it
into `LANGFUSE_WEBHOOK_SECRET` exactly as shown (it is used as UTF-8 bytes, not decoded).

## How Do I Register an Endpoint?

1. In Langfuse, open your project and go to **Prompts** → **Automations** (prompt management).
2. Create an automation and choose the events to watch: prompt version **Created**, **Updated** and/or **Deleted**.
3. Choose the **Webhook Call** action (the other option is Slack) and enter your endpoint URL,
   for example `https://<your-hookdeck-url>` or the URL printed by:
   ```bash
   npx hookdeck-cli listen 3000 langfuse --path /webhooks/langfuse
   ```
4. Save, and copy the signing secret that is displayed.

The UI labels can differ slightly between Langfuse versions; see the
[official guide](https://langfuse.com/docs/prompt-management/features/webhooks-slack-integrations).

## Testing

Create or relabel a prompt version in the project and watch the request arrive. Remember that
relabelling produces two `updated` deliveries. The example test suites sign payloads locally, so
they need no Langfuse account.
