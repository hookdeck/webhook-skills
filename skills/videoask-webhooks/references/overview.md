# VideoAsk Webhooks Overview

## What Are VideoAsk Webhooks?

VideoAsk (Typeform's video form product) can send a JSON `POST` to a URL you choose when a
respondent completes a videoask or when a message is exchanged with a contact. You can set a
webhook up in the **Connect** tab of a videoask, or with the API
(`PUT /forms/{form_id}/webhooks/{tag}`). Requests are **not signed**. The only authentication
available is a custom header: **Add a secret** (header name and value) in the Connect tab, or the
API's `headers` object.

Your endpoint must return a `2xx` status. If a request fails for any reason, VideoAsk retries
it 3 times with back-off, after 5, 10 and 20 minutes.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `form_response` | A videoask is completed or abandoned and all video/audio media is transcoded | Store answers, create a CRM contact |
| `form_response_transcribed` | Same, and media is also transcribed (can take 3-4 minutes) | Index transcripts, run sentiment analysis |
| `form_author_message` | The videoask creator sends a message to the contact (transcoded and transcribed) | Log conversation history |
| `form_contact_message` | The contact sends a message (transcoded and transcribed) | Notify the team of a reply |
| `form_contact_tagged` | A tag is added to a contact | Sync tags to a CRM |
| `form_contact_untagged` | A tag is removed from a contact | Sync tags to a CRM |

The two tag events are listed in VideoAsk's help centre (Connect tab event toggles); no example
payload for them is published.

The event name is in the `event_type` field. Subscribe to specific events with the
`event_types` array when you create the webhook.

## Event Payload Structure

Every payload is a JSON object with:

- `event_id` - unique id for the event (use it for idempotency)
- `event_type` - one of the values above
- `interaction_id` - present on `form_response`, `form_response_transcribed` and `form_contact_message` examples
- `contact` - `contact_id`, `name`, `email`, `phone_number`, `status`, `created_at`, `updated_at`,
  `answers` (poll, video, audio or text answers) and, on message events, `messages`
- `form` - the videoask: `form_id`, `title`, `share_url`, `questions`, ...

Abridged `form_response` payload (from the docs):

```json
{
  "event_id": "7df19833701662b6414ed1765dcc626c",
  "event_type": "form_response",
  "interaction_id": "386bbc0b-bb60-4b62-82fa-d630d0d2b83b",
  "contact": {
    "contact_id": "7c6550ff-fe15-424a-918e-2c1936db8aed",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "status": "completed",
    "answers": [
      { "answer_id": "0f4ab93a-4914-4e4a-a33b-8466fda6147a", "type": "poll", "poll_option_content": "Grapes" }
    ]
  },
  "form": {
    "form_id": "5a1b8066-f92c-47bf-b8f2-3beb0a738122",
    "title": "Example form for documentation"
  }
}
```

## Full Event Reference

See [VideoAsk's webhooks documentation](https://developers.videoask.com/).
