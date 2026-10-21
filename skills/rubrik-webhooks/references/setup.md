# Setting Up Rubrik Webhooks

## Prerequisites

- A Rubrik Security Cloud account with permission to manage webhooks
- A public HTTPS endpoint (for local development, use `npx hookdeck-cli listen 3000 rubrik --path /webhooks/rubrik`)
- For API setup: an RSC service account access token

## Choose Your Credential

Rubrik webhooks are not signed, so pick an authentication type and generate the secret yourself
(e.g. `openssl rand -hex 32`):

| Rubrik auth type | What to enter in Rubrik | What to set in your app |
|------------------|-------------------------|-------------------------|
| Custom header (`CUSTOM_HEADER`, recommended) | Header key, e.g. `X-Rubrik-Webhook-Token`, and the secret as value | `RUBRIK_WEBHOOK_HEADER_NAME`, `RUBRIK_WEBHOOK_SECRET` |
| Bearer (`BEARER`) | The token | `RUBRIK_WEBHOOK_BEARER_TOKEN` |
| Basic (`BASIC`) | Username and password | `RUBRIK_WEBHOOK_USERNAME`, `RUBRIK_WEBHOOK_PASSWORD` |

The header key is yours to choose; `X-Rubrik-Webhook-Token` is just the examples' default.
If you set the key to `Authorization`, put the full value (e.g. `Bearer abc123`) in
`RUBRIK_WEBHOOK_SECRET`.

## Register Your Endpoint (RSC Console)

1. In Rubrik Security Cloud, open **Settings → Webhooks** and add a webhook.
2. Choose a **Custom** provider and enter your endpoint URL.
3. Choose the authentication type and enter the credential from the table above.
4. Subscribe to events (and/or audits): pick event types such as **Backup** and **Anomaly**,
   object types and severities.
5. Keep the default payload template, or supply a custom JSON template.
6. Save, then confirm your endpoint returns `200` for the first deliveries (watch them in the Hookdeck CLI UI).

Exact menu labels can vary between RSC releases; see the RSC user guide's Webhooks page.

## Register Your Endpoint (GraphQL API)

```graphql
mutation {
  createWebhookV2(input: {
    payload: {
      name: "my-app"
      description: "Backup failures and anomalies"
      url: "https://example.com/webhooks/rubrik"
      providerType: CUSTOM
      subscriptionType: {
        eventSubscription: {
          objectTypes: []
          isSubscribedToAllObjectTypes: true
          eventTypes: [BACKUP, ANOMALY]
          severities: [SEVERITY_CRITICAL, SEVERITY_WARNING, SEVERITY_INFO]
        }
      }
      authInfo: {
        authType: CUSTOM_HEADER
        customHeaders: {
          headerKey: "X-Rubrik-Webhook-Token"
          headerValue: "a-long-random-string"
        }
      }
    }
  }) {
    webhook { id name status }
    errorInfo { errorMessage statusCode }
  }
}
```

Send it to `https://<your-account>.my.rubrik.com/api/graphql` with
`Authorization: Bearer $RSC_TOKEN`.

Other `authInfo` shapes (`WebhookAuthInfoV2Input`):

```graphql
# BEARER
authInfo: { authType: BEARER, token: "a-long-random-string" }

# BASIC
authInfo: { authType: BASIC, userCredentials: { username: "rubrik", password: "a-long-random-string" } }
```

To add a custom payload, set `templateInfo: { customTemplate: "..." }` inside
`eventSubscription`.

## Check Webhook Health

```graphql
query {
  allWebhooksV2 {
    id name status url authType
    lastFailedErrorInfo { errorMessage statusCode }
  }
}
```

`status` is `ENABLED`, `DISABLED` or `AUTO_DISABLED`. Rubrik auto-disables a webhook after 25
consecutive failures; fix the endpoint, then re-enable it.

## Rotating the Secret

There is no dual-secret support. To rotate without dropping events, have your endpoint accept
both the old and new values for a short window, update the webhook in Rubrik, then remove the
old value.
