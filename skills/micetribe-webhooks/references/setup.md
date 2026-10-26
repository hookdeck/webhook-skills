# Setting Up MICEtribe Webhooks

Docs: [MICEtribe Webhooks](https://developer.micetribe.com/webhooks-10150906f0)

## Prerequisites

- A MICEtribe account with an event and management API access
- A publicly reachable HTTPS endpoint that accepts `POST` requests. Use a tunnel for local development

## Register Your Endpoint

MICEtribe webhooks are managed through the Integrations API (v1, management-authenticated), under the **Webhooks** section of the [API reference](https://developer.micetribe.com/webhooks-10150906f0): create, update, delete and list webhook calls.

- Base URL: `https://api.micetribe.com/integrations/v1` (production) or `https://api.staging.micetribe.com/integrations/v1` (staging)
- Point the webhook at your URL, e.g. `https://your-app.example.com/webhooks/micetribe`
- Enable one or more triggers: `registration.created`, `registration.updated`, `registration.deleted`, `registration.attended`, `registration.printed`. MICEtribe posts only if the trigger is enabled on an active webhook for the same `event_id`

## Get Your Signing Secret

> MICEtribe signs webhooks only when the webhook has a signing secret. Set one on the webhook and paste it here.

You choose the signing secret yourself when you create (or update) the webhook; MICEtribe stores it encrypted. Use the same value as `MICETRIBE_WEBHOOK_SECRET`. It is used as UTF-8 bytes, so don't hex- or base64-decode it. Don't log it.

## Hookdeck

With Hookdeck, create a source of type **MICEtribe**, paste the signing secret into it, and use the Hookdeck source URL as the webhook URL. MICEtribe's `X-Signature` is verified there, and retries and replays keep the original `X-Timestamp`.

## Local Development

```bash
npx hookdeck-cli listen 3000 micetribe --path /webhooks/micetribe
```

Use port `8000` for the FastAPI example.

## Testing

Create a registration (or update, attend or print one) on a test event and check that your handler logs the trigger. There is no separate test mode: use the staging API for experiments.
