# Setting Up SaladCloud Webhooks

SaladCloud has no endpoint list to register. You give each Job Queue job its own webhook URL, and use the
portal only to read the secret key.

## Prerequisites

- A SaladCloud account with a Job Queue (Container Engine job processing)
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Get Your Webhook Secret

1. Copy your organization's webhook secret key from the SaladCloud portal, or read it with
   `GET /organizations/{organization_name}/webhook-secret-key`
   ([API reference](https://docs.salad.com/reference/saladcloud-api/organizations/get-webhook-secret-key)).
   `POST` to the same path replaces it; SaladCloud documents no overlap period, so update every verifier
   (and your Hookdeck source) when you rotate.
2. Copy it. It is a **base64 string with no `whsec_` prefix**.
3. Put it, exactly as shown, in `SALAD_CLOUD_WEBHOOK_SECRET` for your own handler. The
   `standardwebhooks` library accepts the bare value, and also the `whsec_` + secret form.

## Set the Webhook URL on a Job

The webhook URL is set per job, in the `webhook` field of the Job Queue job you create. When the job
succeeds, SaladCloud sends one `POST` to that URL with a `queue.job.succeeded` event. No challenge or
validation request is documented, so the endpoint doesn't need a handshake.

## Configure Hookdeck

Paste the bare base64 portal secret into the SaladCloud source. Existing `whsec_`-prefixed values also work.
Point each job's `webhook` field at the source URL.

## Local Development

```bash
npx hookdeck-cli listen 3000 salad-cloud --path /webhooks/salad-cloud
```

Use the URL the CLI prints as the job's `webhook`, then submit a job and wait for it to succeed.

## Testing

There is no test button. Submit a short job to your queue and let it finish. Check that `webhook-id`,
`webhook-timestamp` and `webhook-signature` arrive and that your handler returns `200`.
