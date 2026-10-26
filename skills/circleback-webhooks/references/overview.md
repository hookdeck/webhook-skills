# Circleback Webhooks Overview

## What Are Circleback Webhooks?

Circleback records and summarizes meetings. Its automations can include a
**Send webhook request** step: for every meeting matching the automation's
conditions, Circleback sends a `POST` with a JSON body describing the meeting.
You choose which meeting outcomes (notes, action items, transcript, insights)
are included. Running the automation on past meetings (select meetings → Actions)
exports them through the same webhook.

## Event Types

Circleback has **no event types**. There is no event-name field or header; every
delivery is a single meeting export. Handle it as "meeting ready" and branch on
which fields are present.

| Delivery | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| Meeting export | A meeting matches the automation's conditions, or you run the automation on past meetings | Sync notes to a CRM, create tasks from action items, post summaries to Slack, archive transcripts |

## Event Payload Structure

```json
{
  "id": "WRweb12iCBimU6Vo8cD7z",
  "name": "Event Venue Review",
  "createdAt": "2023-07-25T20:30:57.926Z",
  "duration": 1306.09,
  "url": "https://meet.google.com/abc-defgh-xyz",
  "recordingUrl": null,
  "tags": ["Events"],
  "icalUid": "1a2b3c@google.com",
  "attendees": [{ "name": "John Appleseed", "email": "john@example.com" }],
  "notes": "#### Overview\n*   Several options for event venues were reviewed...",
  "actionItems": [
    {
      "id": 252,
      "title": "Contact event venues",
      "description": "Reach out to potential event venues.",
      "assignee": { "name": "John Appleseed", "email": "john@example.com" },
      "status": "PENDING"
    }
  ],
  "transcript": [{ "speaker": "John Appleseed", "text": "Hey, how's it going?", "timestamp": 4.56 }],
  "insights": {
    "Questions": [{ "insight": "Is this thing on?", "speaker": "Samantha Grey", "timestamp": 49.15 }]
  }
}
```

- `id` is the Circleback meeting ID; `https://circleback.ai/meetings/${id}` links to it.
- `recordingUrl` is only valid for 24 hours and only present if saving recordings is enabled.
- `actionItems[].status` is `PENDING` or `DONE`; `assignee` is `null` when unassigned.
- `insights` keys are the names of your own AI insights; a value's `insight` is a string, or an object if the insight has custom fields.
- Circleback sends no delivery ID header. Deduplicate on the meeting `id`.

## Full Event Reference

See [Circleback's webhook documentation](https://circleback.ai/docs/support/automations/export-meeting-data-with-webhooks).
