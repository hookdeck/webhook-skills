# Setting Up Sendbird Webhooks

## Prerequisites

- A Sendbird application (Chat)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 sendbird --path /webhooks/sendbird` locally; use port 8000 for FastAPI)

## Get Your Signing Key

Sendbird has no separate webhook signing secret. Signatures are keyed with the application's **master API token**.

1. Open the Sendbird Dashboard and select your application.
2. Go to **Settings > Application > General** and copy the **master API token**.
3. Store it as `SENDBIRD_API_TOKEN` in your server environment.

Secondary API tokens will not produce valid signatures. The master token is a full-access credential for the application: keep it server-side, never ship it in client apps or commit it, and rotate it if exposed.

## Register Your Endpoint

1. In the Dashboard go to **Settings > Chat > Webhooks**.
2. Turn webhooks on and enter your endpoint URL (e.g. `https://example.com/webhooks/sendbird`).
3. Select the categories to receive. Good starting set: `group_channel:message_send`, `group_channel:create`, `group_channel:join`, `open_channel:message_send`, `user:block`.

The endpoint must support HTTP/1.1 and keep-alive, accept POST, and parse JSON. Sendbird waits 5 seconds and retries up to three times, so return `200` immediately.

## Test Mode vs Live Mode

Sendbird has no test-mode webhooks. Use a separate application (with its own master token) for development, or trigger real events (send a message in a test channel) and inspect them with the Hookdeck CLI.
