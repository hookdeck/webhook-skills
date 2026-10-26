# Setting Up Zigpoll Webhooks

## Prerequisites

- A Zigpoll account and a survey
- A public `https://` endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Log in to your Zigpoll dashboard.
2. Go to **Integrations** and scroll down to **Webhooks**.
3. Create a webhook by filling in the form: the survey, your endpoint URL and a delivery rule.
   - **Send if the survey is partially or fully completed**: sends `submitted-responses` on every submission
   - **Send only if the survey is fully completed**: sends `completed-survey` at the end

You can add up to 20 webhooks per survey. They can also be managed through the API (`GET`/`POST`/`DELETE /webhooks`), which needs a Premium plan or higher and an Owner, Admin or Billing Admin API key.

## Get Your Signing Secret

The **Signing Secret** belongs to the account, not to a webhook: every webhook and every survey-logic webhook on the account uses the same one. It is created with the account's first webhook, shown once in **Integrations → Webhooks** (the API returns it only in the create response), and doesn't change when you add or delete webhooks. Store it as `ZIGPOLL_WEBHOOK_SECRET`. There is no self-serve rotation; contact support@zigpoll.com.

The legacy `X-Zigpoll-Secret` header (the webhook's Secret Key) is not the Signing Secret. Verify `X-Zigpoll-Signature`.

## Testing

Submit a response to the survey the webhook is attached to. For local development:

```bash
npx hookdeck-cli listen 3000 zigpoll --path /webhooks/zigpoll
```

Use the Hookdeck URL as the endpoint. If a webhook stops delivering for a day, Zigpoll emails the account's notification recipients.
