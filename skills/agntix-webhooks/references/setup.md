# Setting Up Agntix Webhooks

## Prerequisites

- An Agntix account with access to the dashboard (https://app.agntix.ai)
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck CLI tunnel below

## Step 1: Expose Your Local Endpoint

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 agntix --path /webhooks/agntix

# FastAPI
npx hookdeck-cli listen 8000 agntix --path /webhooks/agntix
```

No account required. The CLI prints a public URL that forwards to `/webhooks/agntix` on your machine, plus a web UI for inspecting requests.

## Step 2: Add the Endpoint

1. In the Agntix dashboard left nav, open **Developer** (under **Integrations**).
2. Click **+ Add Endpoint** in the top-right.
3. Fill in the dialog:
   - **Endpoint URL** (required): a public HTTPS URL, e.g. `https://<your-hookdeck-url>/webhooks/agntix`
   - **Description**: a free-form label such as "Production call events"
   - **Rate Limit**: a requests-per-second cap. Set it comfortably above your peak, for example `50` for a burst of 10 concurrent calls
   - **Subscribe to events** (required): tick `session.created` and/or `session.ended`
4. Save the endpoint.

There is no challenge or handshake when you add an endpoint.

## Step 3: Get the Signing Secret

Each endpoint has its own signing secret. Agntix delivers webhooks through Svix, and Svix's default secret form is `whsec_` followed by base64. Agntix's docs don't print a secret value or its format, so open the endpoint in **Developer** and copy the signing secret it shows.

Store the **full** value (including `whsec_`) in `AGNTIX_WEBHOOK_SECRET`. The `svix` library decodes the part after `whsec_` itself.

```bash
AGNTIX_WEBHOOK_SECRET=whsec_xxxxx
```

## Step 4: Correlate Events With Your Own Records

Webhooks for parallel calls arrive in unpredictable order. Pass identifiers in `session_variables` when you trigger a session (for example `crmContactId`, `campaignId`, `taskId`). Agntix echoes them back verbatim under `metadata.sessionVariables` on every event.

## Testing

Start an outbound call or a chat session on an agent, then watch `session.created` and `session.ended` arrive in the Hookdeck CLI web UI. Resend requests from there while iterating on your handler. Resent requests keep their original `svix-timestamp`, so the `svix` library rejects them after 5 minutes (see [verification](verification.md)).

## Delivery Notes

- Reply `2xx` within 15 seconds. Enqueue the event and process it asynchronously.
- Failed deliveries are retried with exponential backoff for up to 24 hours, then dead-lettered.
- Only `session.created` and `session.ended` are delivered today.
