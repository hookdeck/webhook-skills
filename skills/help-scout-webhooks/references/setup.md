# Setting Up Help Scout Webhooks

## Prerequisites

- A Help Scout account with permission to manage apps in the workspace
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI while developing)

## Get Your Secret Key

Help Scout has no generated signing secret. You choose the **secret key** yourself when you create the webhook, and it is the HMAC key.

1. Log in to Help Scout and click the gear icon (Settings) at the top right.
2. Go to **Workspace > Apps** and select the **Webhooks** app.
3. Create a new webhook and enter a long random **secret key**.
4. Store the same value as `HELPSCOUT_WEBHOOK_SECRET` in your server environment.

## Register Your Endpoint

1. In the Webhooks app, set the **Callback URL** to your endpoint, for example `https://example.com/webhooks/help-scout`.
2. Select the events to receive. Good starting points: `convo.created`, `convo.assigned`, `convo.status`, `convo.customer.reply.created`, `customer.created`, `satisfaction.ratings`.
3. Save the webhook.

## Local Development

```bash
npx hookdeck-cli listen 3000 help-scout --path /webhooks/help-scout
```

Use the URL the CLI prints as the callback URL. FastAPI examples run on port 8000 instead.

## Things to Know

- The event name arrives in `X-HelpScout-Event`, not in the body.
- Respond with a 2xx quickly. Return 400 for a failed signature check, never 410, which deletes the webhook.
- `customer.created` fires for every customer created globally and cannot be filtered by inbox.
- If ten or more events are discarded after failed retries, Help Scout deactivates the webhook, so re-enable it after an outage.
