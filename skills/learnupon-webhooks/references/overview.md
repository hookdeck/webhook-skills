# LearnUpon Webhooks Overview

## What Are LearnUpon Webhooks?

LearnUpon (the learning management system) sends event notices to a URL you define, as a JSON `POST`,
when something happens on your portal: a learner completes a course, a manager enrolls a learner, a
badge is awarded. Webhooks version 2.0 report users, courses, modules, enrollments, purchases, badges,
learning paths, live-learning sessions and learning journeys.

Only Webhooks v2.0 are supported. Ask LearnUpon support to turn them on.

Version 1 is a separate, older scheme. For now both versions can run in parallel, but v2.0 has breaking
changes and a different signature process, so give v2.0 its own endpoint and processing path.

## Request Shape

- Method: `POST`, `Content-Type: application/json`.
- Body: `{"data": [ ... ]}`. Up to 10 events of **one type** are batched in a single request. Loop over `data`.
- The event type is in the `X-Webhook-Type` header, not in the body.

| Header | Meaning |
|--------|---------|
| `X-Webhook-Signature` | Hex HMAC-SHA256 of the raw body, keyed with your secret |
| `X-Webhook-Type` | Event type, e.g. `course_completion` |
| `X-Webhook-ID` | Unique id of the webhook; use it to dedupe |
| `X-Webhook-Attempt` | Number of attempts so far |
| `X-Webhook-Last-Attempt-At` | UTC time of the last attempt |
| `X-LearnUpon-TimeStamp` | Unix time the webhook was generated (not signed) |
| `X-Webhook-Subscription-ID` | Subscription identifier (reserved for future use) |
| `X-LearnUpon-Version` | `2.0` |
| `User-Agent` | `LearnUpon Webhook/v2` |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user_created` | An admin creates a user account | Provision the user in another system |
| `user_updated` | Someone updates a user account's details | Keep profiles in sync |
| `course_cloning_complete` | An admin finishes cloning a course | Update a course catalog |
| `course_completion` | A learner completes a course | Issue certificates, update HR records |
| `course_updated` | Someone updates a course | Refresh catalog data |
| `module_complete` | A learner completes a module within a course | Track progress |
| `purchase_completion` | A customer completes a purchase of courses | Fulfilment, accounting |
| `badge_awarded` | The portal awards a badge | Recognition feeds |
| `badge_revoked` | An admin removes a badge from a learner | Revoke recognition |
| `course_enrollment` | Someone enrolls a learner on a course | Notify the learner, sync rosters |
| `course_unenrollment` | Someone unenrolls a learner from a course | Remove from rosters |
| `learning_path_enrollment` | Someone enrolls a learner on a learning path | Sync rosters |
| `learning_path_updated` | Someone updates a learning path | Refresh catalog data |
| `learning_path_completion` | A learner completes a learning path | Issue credentials |
| `event_session_creation` | Someone creates a live-learning event session | Calendar sync |
| `event_session_updated` | Someone updates a live-learning event session | Calendar sync |
| `event_session_canceled` | Someone cancels a live-learning event session | Calendar sync |
| `learning_journey_enrollment` | Someone enrolls a learner on a learning journey | Sync rosters |
| `learning_journey_completion` | A learner completes a learning journey | Issue credentials |
| `learning_journey_blocked` | A learner's journey enrollment is blocked | Alert an admin |
| `learning_journey_deleted` | An admin deletes a learning journey | Clean up |
| `learning_journey_archived` | An admin archives a learning journey | Clean up |

## Event Payload Structure

Most events carry `eventCreated` (UTC timestamp) plus event-specific fields. Enrollment and completion
events include a `user` object (`userId`, `email`, `username`):

```json
{
  "data": [
    {
      "eventCreated": "2023-12-14T19:41:35.463Z",
      "user": { "userId": 285900, "email": "bella.bell@yourdomain.com", "username": null },
      "enrollmentId": 18976600,
      "dueDate": null,
      "courseId": 2712800,
      "wasRecertified": false
    }
  ]
}
```

## Delivery and Retries

Answer `2xx`, ideally within 2 seconds; no response within 7 seconds is a failure. Failed webhooks are
resent for 72 hours at 10 minutes, 3 hours, 12 hours, 24 hours and 48 hours. LearnUpon retains all
webhooks for 45 days. LearnUpon sends at most 10 events per request over at most 5 parallel connections
(subject to change).

## Full Event Reference

For every payload's attributes, see [LearnUpon's webhooks v2.0 guide](https://docs.learnupon.com/webhooks/v2/).
