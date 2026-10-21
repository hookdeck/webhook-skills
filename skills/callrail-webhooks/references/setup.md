# Setting Up CallRail Webhooks

## Prerequisites

- A CallRail account with access to the company's integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 callrail --path /webhooks/callrail` for local development)

## Get Your Signing Key

CallRail generates a secret signing key for every company. View it on the **Webhooks configuration page** inside the CallRail app (Settings → Integrations → Webhooks). Through the API, request the `signing_key` field of the Webhooks integration (it is also returned when you create the integration). Store it as `CALLRAIL_SIGNING_KEY`.

## Register Your Endpoint

In the app: open the Webhooks integration, enter the URL for each event you want, and save. Register a separate URL per event and add a query string so your handler knows which one fired:

```
https://example.com/webhooks/callrail?callrail_event=post_call
https://example.com/webhooks/callrail?callrail_event=updated_call
https://example.com/webhooks/callrail?callrail_event=sms_received
https://example.com/webhooks/callrail?callrail_event=form_captured
```

`callrail_event` is a convention used by this skill's examples, not a CallRail feature.

Via the API (`POST /v3/a/{account_id}/integrations.json`):

```bash
curl -H "Authorization: Token token={api_token}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"type":"Webhooks","company_id":"COM...","config":{"post_call_webhook":["https://example.com/webhooks/callrail?callrail_event=post_call"]}}' \
  "https://api.callrail.com/v3/a/{account_id}/integrations.json"
```

Each `config` key takes an array of URLs: `pre_call_webhook`, `answered_call_webhook`, `post_call_webhook`, `updated_call_webhook`, `sms_received_webhook`, `sms_sent_webhook`, `form_captured_webhook`, `post_outbound_call_webhook`, `updated_outbound_call_webhook`. A company can have only one Webhooks integration.

Recommended events: `post_call_webhook` together with `updated_call_webhook`, so recording, transcription and summary changes are not missed.

## Test Mode vs Live Mode

CallRail has no separate test mode. Test your signature code offline with the docs test vector (key `072e77e426f92738a72fe23c4d1953b4`, expected signature `UZAHbUdfm3GqL7qzilGozGzWV64=`), then trigger real events with a test call, text or form submission on a tracking number.

## Things to Know

- Form Submission webhooks need Form Tracking to be active.
- Return `2xx` for every request you accept. CallRail does not retry, and repeated failures can disable the integration.
