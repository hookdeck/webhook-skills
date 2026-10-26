# Setting Up a Torii Custom Action

## Prerequisites

- A Torii account with permission to build workflows
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 torii --path /webhooks/torii` locally)

## Create the Credential

Generate a long random secret and store it, with the header name you will use, in your
environment:

```bash
TORII_WEBHOOK_HEADER=Authorization
TORII_WEBHOOK_SECRET="Bearer your-long-random-secret"
```

`TORII_WEBHOOK_SECRET` must be the **exact, whole** header value, including a `Bearer ` prefix if
you type one in Torii. The header name is your choice; it defaults to `Authorization`.

## Add the Custom Action to a Workflow

1. In Torii, create or edit a workflow and add the **Custom action (HTTP Request)** step.
2. Choose the HTTP method and enter your endpoint URL (for example
   `https://example.com/webhooks/torii`).
3. In the headers step (Step 7, key-value pairs), add the header name and value from above.
4. Write the JSON body template, using `@` placeholders for the Torii data you want to send.
5. Save and run the workflow.

## Using Hookdeck

Hookdeck's Torii source verifies the header name and exact whole value (API key verification).
It **pre-selects POST** without managing the method, so if your custom action uses PUT, PATCH,
GET or DELETE, allow that method on the source as well.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/torii \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-long-random-secret" \
  -d '{"workflow":"new app discovered","app":{"name":"Example App"}}'
```

## Network Notes

This skill does not rely on an IP allowlist. Use the secret header and HTTPS.
