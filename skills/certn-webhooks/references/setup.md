# Setting Up Certn Webhooks

## Prerequisites

- A CertnCentric account with access to the Integrations area of the Client Portal
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)
- A handler that answers the `GET` challenge, running before you add the URL

## Add Your Webhook URL

1. Start your server, with `GET` and `POST` handlers on the webhook path.
2. In the CertnCentric Client Portal, open the Integrations area and add the webhook URL.
3. Certn sends `GET <URL>?challenge=<value>`. Your handler returns `200` with the value as the body within 10 seconds, or Certn disables the webhook.
4. Copy the signing key Certn provides for the webhook into `CERTN_WEBHOOK_SECRET`. Use it as given, as a UTF-8 string.

Certn re-verifies the URL periodically. If a later check fails, Certn disables the webhook and emails you, so keep the `GET` handler deployed for as long as the webhook exists.

## Regions

CertnCentric runs separate instances in North America (CA), Europe, Middle East and Africa (UK) and Asia Pacific (AU). API keys and webhooks are per region and aren't copied between them, so add a webhook in each region where you order cases.

## Moving From the Legacy API

Legacy webhook URLs and secrets don't carry over. Add the URL again in CertnCentric, store the new signing key, and replace legacy verification code (`Certn-Signature`, `t=`/`v1=`) with the `X-Signature` check.

## Receiving Through Hookdeck

Create a Certn source in Hookdeck, paste the signing key, and add the source URL in the Certn Client Portal.

## Local Development

```bash
npx hookdeck-cli listen 3000 certn --path /webhooks/certn
```

Add the Hookdeck URL in the Client Portal. For FastAPI use port `8000`.

## Testing

Certn offers sandbox environments (for example `https://api.sandbox.certn.co` in North America) for developing against the API without check fees. Order a case there and watch for `CASE_STATUS_CHANGED` and `CHECK_STATUS_CHANGED`.

## Respond Quickly

Return `200` within 10 seconds. Verify the signature, record the `event_id`, queue the work and respond.
