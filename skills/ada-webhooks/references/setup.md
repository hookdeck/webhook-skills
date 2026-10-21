# Setting Up Ada Webhooks

## Prerequisites

- An Ada AI Agent with dashboard access to **Config > PLATFORM > Webhooks**, or an [Ada API key](https://docs.ada.cx/reference/introduction/authentication) to use the Webhooks API
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Add an Ada Webhook Endpoint in the Dashboard?

1. Go to **Config > PLATFORM > Webhooks**.
2. Click **Add Endpoint**.
3. Enter your URL, for example `https://your-app.com/webhooks/ada`.
4. Select the event types to subscribe to (for example `v1.conversation.created`, `v1.conversation.message`, `v1.conversation.ended`).
5. Click **Create**.

Ada recommends enabling all event types while testing and narrowing them for production.

## How Do I Create an Endpoint With the Webhooks API?

```bash
curl -X POST https://<your-ai-agent>.ada.support/api/v2/webhooks/ \
  -H "Authorization: Bearer $ADA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.com/webhooks/ada",
       "description": "Production receiver",
       "event_filters": ["v1.conversation.created", "v1.conversation.ended"]}'
```

An empty `event_filters` list subscribes to all events. The response includes the endpoint `id` (for example `ep_2bxE8VNtkWEMpJrMJv74FlSQmqP`). Endpoints created through the API also appear in the dashboard. EU AI Agents use `*.ada-eu.support` domains.

## Where Do I Get the Ada Webhook Signing Secret?

Each endpoint has its own signing secret.

- **Dashboard:** open the endpoint in **Config > PLATFORM > Webhooks** and reveal its **Signing Secret**.
- **API:**
  ```bash
  curl https://<your-ai-agent>.ada.support/api/v2/webhooks/{id}/secret/ \
    -H "Authorization: Bearer $ADA_API_KEY"
  # {"key": "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD"}
  ```

Store the full value, including `whsec_`, as `ADA_WEBHOOK_SECRET`.

## How Do I Rotate the Secret?

`POST /api/v2/webhooks/{id}/secret/rotate/` rotates it, optionally with a custom `key` in the body. The response doesn't include the new secret, so fetch it with the get secret endpoint afterwards. Svix keeps signing with the previous secret for a while after a rotation, sending both signatures in `svix-signature`, so update `ADA_WEBHOOK_SECRET` promptly and the handler keeps verifying.

## Local Development

```bash
npx hookdeck-cli listen 3000 ada --path /webhooks/ada   # Express / Next.js
npx hookdeck-cli listen 8000 ada --path /webhooks/ada   # FastAPI
```

No account required. Add the printed URL as an endpoint, then start a conversation with your AI Agent to trigger `v1.conversation.created`.

If you don't have a receiver yet, the **Use Svix Play** button in the Webhooks UI generates a temporary URL that logs deliveries. It's for testing only.

## Channel Filtering

To receive only some channels' events, add values to the endpoint's **Channels** field: a Conversations API custom channel ID (for example `5df263b7db5a7e6ea03fae9b`), a handoff integration name (`salesforce`, `zendesk_chat`), or your SMS channel ID. Svix filters before delivery.

## Custom Headers and IP Allowlisting

- **Custom headers:** endpoint → **Advanced** tab → **Custom Headers**. They're added to every delivery to that endpoint. Use them for routing, not as a replacement for signature verification.
- **IP allowlisting:** deliveries come from [Svix source IPs](https://docs.svix.com/receiving/source-ips). Use the US list for `*.ada.support` AI Agents and the EU list for `*.ada-eu.support`.
