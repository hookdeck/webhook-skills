# Setting Up Doppler Webhooks

## Prerequisites

- Doppler account with permission to manage webhooks on a project
- Your application's webhook endpoint URL (use the Hookdeck CLI for local development)

## Register Your Endpoint and Signing Secret

1. In Doppler, open a project, then click **Webhooks** in the project menu.
2. Click **+ Add** to open the configuration drawer.
3. Enter the webhook **URL** and choose which **configs** it triggers for (root configs are bold).
4. Optionally enter a **JSON payload**. It must be valid JSON with no variables. Leave it empty to get the default `config.secrets.update` payload.
5. Enter a **Secret**. This is the signing secret and it is optional in Doppler, but without it no `X-Doppler-Signature` header is sent and anyone who finds your URL can post to it. Doppler says to set it especially when Authentication is `None`. Always set one.
6. Click **Save**. The webhook appears under **Active Webhooks**; use the three-dot menu to edit it.

Store the same Secret in your app as `DOPPLER_WEBHOOK_SECRET`.

## Local Development

```bash
npx hookdeck-cli listen 3000 doppler --path /webhooks/doppler
```

Use the Hookdeck URL as the webhook URL in Doppler.

## Testing and Troubleshooting

Change a secret in a selected config to trigger a delivery. In the project's **Webhooks** page, the **Logs** tab shows each attempt with the response status, attempt number (up to 5), config, and the payload sent. You can filter by success or failure.
