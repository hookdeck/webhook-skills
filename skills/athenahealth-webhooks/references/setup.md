# Setting Up athenahealth Webhooks

## Prerequisites

- An athenahealth Developer Portal account with an OAuth client ID and secret (see [athenahealth API Onboarding Overview](https://docs.athenahealth.com/api/guides/onboarding-overview))
- OAuth scopes `system/SubscriptionTopic.read` and `system/Subscription.write`
- A public HTTPS endpoint on port 443 with a valid certificate (use `npx hookdeck-cli listen` during development)
- Access to the Event Subscription Platform (alpha rollout at the time of the README)

## Choose Your Signing Secret

athenahealth has no dashboard secret. **You** pick a random shared secret and send it as the `X-Hub-Secret` header when you create the Subscription. athenahealth uses it to sign every notification for that subscription.

```bash
openssl rand -hex 32
```

**Set the `X-Hub-Secret` header when you create the FHIR subscription and paste the same value here** (as `ATHENAHEALTH_WEBHOOK_SECRET` for the examples, or as the webhook secret on your Hookdeck athenahealth source). Without it, notifications are unsigned and `X-Hub-Signature` is absent.

## Register Your Endpoint

1. Discover topics (optional):
   ```bash
   curl --header 'Authorization: Bearer <token>' \
     https://api.platform.athenahealth.com/fhir/r4/SubscriptionTopic
   ```
2. Create one Subscription per topic and per practice:
   ```bash
   curl --request POST https://api.platform.athenahealth.com/fhir/r4/Subscription \
     --header 'Authorization: Bearer <token>' \
     --header 'Content-Type: application/json' \
     --header 'X-Hub-Secret: <random-shared-secret>' \
     --data-raw '{
       "resourceType": "Subscription",
       "meta": { "profile": ["http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-subscription"] },
       "status": "requested",
       "end": "2027-12-31T12:00:00Z",
       "reason": "Appointment sync",
       "criteria": "https://api.platform.athenahealth.com/fhir/r4/SubscriptionTopic/Appointment.schedule",
       "_criteria": { "extension": [{
         "url": "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-filter-criteria",
         "valueString": "ah-practice=Organization/a-1.Practice-195000"
       }] },
       "channel": {
         "type": "rest-hook",
         "endpoint": "https://example.org/webhooks/athenahealth",
         "payload": "application/fhir+json",
         "_payload": { "extension": [{
           "url": "http://hl7.org/fhir/uv/subscriptions-backport/StructureDefinition/backport-payload-content",
           "valueCode": "id-only"
         }] }
       }
     }'
   ```
   A `201 Created` response returns the Subscription `id`.
3. To change a subscription (including its secret) use `PUT /Subscription/{id}` with a new `X-Hub-Secret`; to stop, `DELETE /Subscription/{id}`.

Recommended topics to start with: `Appointment.schedule`, `Appointment.cancel`, `Encounter.signoff`, `LabResult.create`.

Filters (`ah-practice`, `ah-department`) go in `_criteria`; they combine with AND.

## Using Hookdeck

Create an athenahealth source in Hookdeck and set its webhook secret to the same value as your `X-Hub-Secret`. Use the Hookdeck source URL as the Subscription's `channel.endpoint`. For local development:

```bash
npx hookdeck-cli listen 3000 athenahealth --path /webhooks/athenahealth
```

## Test Mode vs Live Mode

The README includes a sample Java webhook app and scripts that publish sample notification Bundles in the same format athenahealth sends. There is no separate sandbox signing secret: use the secret from the Subscription you created.
