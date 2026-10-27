# Setting Up SurveyMethods Webhooks

## Prerequisites

- A SurveyMethods account on the Professional, Team Professional or Enterprise plan
- Your application's webhook endpoint URL (HTTPS)

## Register Your Endpoint

1. In SurveyMethods open **Account > Webhooks** (or use the `/api/v1/webhooks` API).
2. Add a webhook with your endpoint URL, choose the events to receive, and scope it to all surveys or one survey.
3. Save it.

## Get Your Signing Secret

1. After saving, copy the signing secret you are shown and store it securely. It is shown once; the API call that creates a webhook also returns it once in its reply.
2. Store it as `SURVEYMETHODS_WEBHOOK_SECRET`. Each webhook has its own secret.

## Setup with Hookdeck

Create a Hookdeck source of type **SurveyMethods**, paste the signing secret into its webhook
verification settings, and use the source URL as the webhook URL in SurveyMethods.

## Local Development

```bash
npx hookdeck-cli listen 3000 surveymethods --path /webhooks/surveymethods
```

## Testing

Complete or start a response on a covered survey, or create a survey, then check the delivery log in
Account > Webhooks for the status of each attempt.
