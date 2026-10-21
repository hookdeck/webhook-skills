# Setting Up Sovos Webhooks

## Prerequisites

- A Sovos Indirect Tax API (e-invoicing) account with an organization ID
- A partner or Sovos Professional Services contact. Only they can configure the
  ERP system and communication method through the API; single-organization
  setup is done in the Compliance Network UI
- An HTTPS endpoint that answers within 30 seconds with a 2xx status

All API calls below send `Content-Type: application/json`,
`Authorization: Bearer {accessToken}`, and `x-correlationId: {uniqueValue}`.

## Step 1: Configure an ERP System

```bash
curl -X POST 'https://api-test.sovos.com/v2/configurations/erp-systems' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {accessToken}' \
  -H 'x-correlationId: {uniqueValue}' \
  --data '[{ "erpSystemId": "TestERPSetup1", "description": "TestERPSetup1" }]'
```

## Step 2: Configure the Webhook Communication Method and Events

Set the communication method to `pushingV2` (Svix) and list the events to send
as `statusEvent` values. This is the **only** place events are chosen.

```bash
curl -X POST 'https://api-test.sovos.com/v2/configurations/workspaces/settings' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {accessToken}' \
  -H 'x-correlationId: {uniqueValue}' \
  --data '[{
    "context": "notification",
    "configurations": [
      {
        "name": "communication_method",
        "value": { "type": "pushingV2", "autoAcknowledgement": true, "appResponseAsLink": true },
        "scope": { "systemId": "TestSystemId" }
      },
      {
        "name": "events",
        "value": { "items": [
          { "statusEvent": "workflow.completed",
            "attachments": [ { "attachmentType": "Legal", "isBase64": true },
                             { "attachmentType": "LegalResponse", "isBase64": true } ] },
          { "statusEvent": "system.error", "attachments": [] }
        ] },
        "scope": { "systemId": "TestSystemId" }
      }
    ]
  }]'
```

- `autoAcknowledgement: true` marks pushed notifications as read automatically (Sovos recommends it).
- `appResponseAsLink: true` puts a download link in `contentUrl` instead of Base64 data (Sovos recommends it).
- Store the returned `appId` (in the `bearer_auth_configuration` entry); later API calls need it.

## Step 3: Get Your Consumer App Portal Link

```bash
curl 'https://api-test.sovos.com/v2/configurations/organizations/{organizationId}/erpSystem/{erpSystemId}/webhook' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer {accessToken}' \
  -H 'x-correlationId: {uniqueValue}'
```

The response `data.url` is a Svix login link (`https://app.svix.com/login?...`)
to the Sovos-branded Consumer App Portal. You can also open it from the
Compliance Network UI.

## Step 4: Register Your Endpoint and Get the Signing Secret

1. Open the Consumer App Portal link.
2. **Add Endpoint**: enter your HTTPS URL (e.g. `https://example.com/webhooks/sovos`).
3. Set a **throttling** value (max messages per second your endpoint accepts).
4. Ignore the event filter. Events come from the Sovos configuration in Step 2.
5. Open the endpoint and copy the **Signing Secret** (`whsec_...`) into
   `SOVOS_WEBHOOK_SECRET`.

Optional advanced settings in the portal: custom headers, transformations,
and additional authentication (OAuth, mTLS).

## Test Your Endpoint

- Use the portal's **Testing** tab to send an example event to your endpoint.
- Use the endpoint's message log to inspect attempts and retry failures.
- For local work, expose your server with the Hookdeck CLI (no account needed)
  and register the printed URL as the endpoint:

  ```bash
  npx hookdeck-cli listen 3000 sovos --path /webhooks/sovos
  ```

## Test vs Production

The samples use the Sovos test API host (`api-test.sovos.com`) and UAT download
links (`uat-einvoicing-api-emea.sovos.com`). Production uses a separate
configuration and portal app, so each environment has its own signing secret.
