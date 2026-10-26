# Setting Up Palmetto Finance Webhooks

## Prerequisites

- A Palmetto Finance (LightReach) organization with API access
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 palmetto-finance --path /webhooks/palmetto-finance` locally)

## Get Your API Key

Use the default server API key authentication. Palmetto shows the key only once, when you register the webhook. Enter apiKey as the header unless your requests show api_key.

1. Create a registration, either in the Palmetto Finance UI (**Developer Settings** tab of your
   organization settings, then **Create**) or with the API:

   ```javascript
   const response = await fetch(`${envBaseUrl}/api/webhooks/registrations`, {
     method: 'post',
     body: JSON.stringify({
       name: 'a descriptive name',
       hostUrl: 'https://my.domain.com',
       includeVisibleOrgEvents: false,
     }),
     headers: { 'Content-Type': 'application/json' },
   });
   const data = await response.json(); // webhookRegistrationId and apiKey
   ```

2. Store the returned `apiKey` as `PALMETTO_FINANCE_WEBHOOK_SECRET` straight away. It is
   returned only once.
3. Palmetto docs call the header `apiKey` in the authentication section and `api_key` in the
   registration section. Send a test delivery and check which name your requests show, then set
   `PALMETTO_FINANCE_WEBHOOK_HEADER` to match (default `apiKey`).

`hostUrl` is only the domain part. The path goes in the subscription's `endpointUrl`.

The other two Palmetto mechanisms, **client headers** (`clientId` and `clientSecret` headers)
and **client basic authorization** (`Authorization: Basic base64(clientId:clientSecret)`), are
not covered by Hookdeck's Palmetto Finance source, and the examples don't check them.

## Register Your Endpoint

Subscribe to events under the registration:

```javascript
await fetch(`${envBaseUrl}/api/webhooks/registrations/${webhookRegistrationId}/subscriptions`, {
  method: 'post',
  body: JSON.stringify({
    endpointUrl: '/webhooks/palmetto-finance',
    httpMethod: 'POST',
    eventType: ['allEvents'],
  }),
  headers: { 'Content-Type': 'application/json' },
});
```

`allEvents` is the recommended starting point. You can instead list specific events such as
`accountCreated`, `applicationStatus`, `contractSigned`, `milestoneAchieved`, `quoteCreated` and
`documentUploaded`.

## HTTP Method

Each subscription sets its own `httpMethod`. The examples use `POST` but accept `GET`, `POST`,
`PUT`, `PATCH` and `DELETE` on the route, check the key first for every method, and handle an
empty body. Hookdeck's Palmetto Finance source pre-selects `POST` without managing the method,
so any other method the sender uses must also be allowed on the source.

## Use With Hookdeck

Create a source with type **Palmetto Finance**. Enter the header name (`apiKey` unless your
requests show `api_key`) and paste the key. Hookdeck checks the header, using the exact whole
value, before forwarding.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/palmetto-finance \
  -H "Content-Type: application/json" \
  -H "apiKey: $PALMETTO_FINANCE_WEBHOOK_SECRET" \
  -d '{"event":"accountCreated","accountId":"acct_1","programType":"solar"}'
```

## Failure Handling

Palmetto does not retry a `401`. 10 failures disable the subscription (skipped events can be
replayed after you re-enable it in the UI or API), so get the header name and key right before
sending real traffic.
