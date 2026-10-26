# Setting Up Act-On Webhooks

## Prerequisites

- An Act-On account with access to **Settings > Connectors > Custom Integrations > Outgoing Webhooks**
- A publicly reachable HTTPS endpoint. For local development, use the Hookdeck CLI tunnel below

## Step 1: Expose Your Local Endpoint

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 act-on --path /webhooks/act-on

# FastAPI
npx hookdeck-cli listen 8000 act-on --path /webhooks/act-on
```

No account required. The CLI prints a public URL that forwards to `/webhooks/act-on` on your machine, plus a web UI for inspecting requests. If you don't have a URL yet, the Act-On setup screen's **Svix Play** option also generates a temporary test URL.

## Step 2: Create the Endpoint

1. In Act-On go to **Settings > Connectors > Custom Integrations > Outgoing Webhooks**.
2. On the **Endpoints** tab, click **+ Add Endpoint**.
3. Enter the **Endpoint URL**, for example `https://<your-hookdeck-url>/webhooks/act-on`.
4. Enter a **Description** (for example "Lead notifications").
5. Under **Message Filtering**, select the events to send. The payload has no event type, so subscribe this endpoint only to the events your handler expects, or create one endpoint per event type.
6. (Optional) Under **Advanced Configuration**, add custom headers, adjust HMAC signatures or set a rate limit. Hookdeck verifies the Svix signature, not custom headers.

Act-On only sends `POST`. If your system allowlists IPs, allow `54.200.92.142`. Each webhook handles up to 10 channels (for example 10 Form IDs or Program IDs).

## Step 3: Get the Signing Secret

The Signing Secret is generated automatically when you configure the endpoint. Paste the endpoint's Signing Secret from the Act-On webhook portal exactly as shown, including any whsec_ prefix.

Put it in `ACT_ON_WEBHOOK_SECRET`. Act-On's pages don't name the signature headers or the secret prefix. They are the Svix defaults (`svix-id`, `svix-timestamp`, `svix-signature`, and a `whsec_` secret), which is what Hookdeck's Act-On source assumes. If you use Hookdeck, paste the same Signing Secret into the Act-On source's verification setting.

## Step 4: Test the Connection

1. Open the **Testing** tab.
2. Select a subscribed event to simulate.
3. Check **Attempted Messages** for the result, and your handler's logs for the payload.

The **Logs** tab shows delivery attempts.

## Event-Specific Setup

- **`form.submitted`**: configure each Form that should trigger a webhook on submission.
- **`contact-lead-score.upper-threshold-surpassed`**: ask Act-On technical support to activate it, and set the threshold on the score sheet.

## Production Checklist

- Verify every delivery against the raw body before parsing.
- Subscribe each endpoint to only the events it handles.
- Deduplicate on `svix-id`.
- Return a `2xx` quickly and process in the background.
- If Hookdeck retries or replays old deliveries, use the manual verifier in [verification.md](verification.md) to drop or widen the 5-minute window.
