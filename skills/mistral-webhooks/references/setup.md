# Setting Up Mistral Webhooks

## Prerequisites

- A Mistral AI Studio account with a voice agent
- Your application's webhook endpoint URL (HTTPS recommended; the API also accepts plain HTTP, but HTTPS protects the payload and secret in transit)

## Create an Endpoint and Get Your Signing Secret

Webhooks are configured per agent, in the Mistral console or through the API.

1. Create an **endpoint**: give it the URL that receives events (e.g. `https://yourdomain.com/webhooks/mistral`) and a name.
2. The platform generates a **signing secret** for the endpoint. Store it securely as `MISTRAL_WEBHOOK_SECRET`.

> The secret is generated once and **cannot be rotated**. If it leaks, delete the endpoint, create a new one, and update your verification code.

## Create a Subscription

1. Create a **subscription** that attaches the endpoint to an agent.
2. Choose the event types to receive: `call_started`, `call_ended`, `call_failed`.

One endpoint can serve several agents, and one agent can have several subscriptions.

## Test Locally

Expose your local server with a tunnel and register the URL as the endpoint:

```bash
npx hookdeck-cli listen 3000 mistral --path /webhooks/mistral
```

Use the FastAPI port (`8000`) for the FastAPI example.

## Respond Quickly

Verify the signature, return `200` right away, then process asynchronously. Mistral times out after 10 seconds and retries 5xx/429 responses.
