# TutorCruncher Webhooks Overview

## What Are TutorCruncher Webhooks?

TutorCruncher (tutorcruncher.com) is business management software for tutoring agencies. An
**integration** on your account has a webhook URL. TutorCruncher pushes a webhook to it every
time an action involving a user or a Job takes place: a Tutor is created, a Client submits an
enquiry, a Lesson is completed, an Invoice is raised, and so on. Zapier and custom apps are the
usual receivers.

## Common Event Types

The event name is the `action` of each element of the `events` array.

| `action` | Fired when | Common use cases |
|----------|------------|------------------|
| `CREATED_A_CONTRACTOR` | A Tutor is created | Onboard the tutor in another system |
| `CHANGED_CONTRACTOR_STATUS` | A Tutor's status is updated | Sync approval status |
| `CREATED_A_CLIENT` | A Client is created | Add to a CRM |
| `CLIENT_ENQUIRY` | A Client makes an Enquiry | Alert the team, create a lead |
| `CREATED_A_SERVICE` | A Job is created | Create a matching task |
| `CREATED_AN_APPOINTMENT` | A Lesson is created | Calendar sync |
| `MARKED_AN_APPOINTMENT_AS_COMPLETE` | A Lesson is marked as complete | Trigger payouts or reports |
| `RAISED_INVOICE` | An Invoice is sent (once per Invoice) | Accounting sync |

## Event Payload Structure

```json
{
  "events": [
    {
      "action": "CREATED_A_CONTRACTOR",
      "verb": "Created a Tutor",
      "timestamp": "2025-03-05T15:26:20.558919Z",
      "branch": 590,
      "actor": {"name": "Jane Smith", "id": 1621, "user_id": 1611, "url": ""},
      "extra_msg": "Created via the API.",
      "subject": {
        "model": "Tutor",
        "url": "https://app.tutorcruncher.com/api/contractors/1623/",
        "id": 1623,
        "status": "approved",
        "last_name": "Gallagher",
        "email": "liam@example.com"
      }
    }
  ]
}
```

- `action`: the upper-snake event type. `verb`: a readable description.
- `actor`: who performed the action (`url` is an empty string for administrators).
- `subject`: the item the action was performed on. Its fields depend on `subject.model`.
- `extra_msg`: how the action happened, e.g. "Created via the API." (generally empty for UI actions).
- Always loop over **every** element of `events`.

## Full Event Reference

The full list is the Action Types section of the
[TutorCruncher API reference](https://app.tutorcruncher.com/api/docs/). The webhook docs are at
[help.tutorcruncher.com](https://help.tutorcruncher.com/en/articles/14182937-webhooks).
