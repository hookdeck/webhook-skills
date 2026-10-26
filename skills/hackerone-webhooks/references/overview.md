# HackerOne Webhooks Overview

## What Are HackerOne Webhooks?

HackerOne webhooks let you build real-time integrations that subscribe to report and program events: update an external issue tracker, trigger notifications, back up report data, or provision a user account. When a subscribed event occurs, HackerOne sends an HTTP `POST` to the webhook's configured URL.

Webhooks are created at the program level and are bound to the permissions of the user who creates them. Subscribe only to the events you handle, to limit the number of requests.

HackerOne's docs do not describe retries, timeouts or success status codes.

## What Headers Does HackerOne Send?

| Header | Description |
|--------|-------------|
| `X-H1-Event` | The name of the event that triggered the delivery |
| `X-H1-Delivery` | A GUID that uniquely identifies the delivery |
| `X-H1-Signature` | `sha256=` plus the hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |

## What Event Types Does HackerOne Send?

The event name is in the `X-H1-Event` header only. These are the events listed in HackerOne's docs:

| `X-H1-Event` | Triggered When |
|--------------|----------------|
| `report_created` | A hacker submits a new vulnerability report |
| `report_new` | A report changed in a way that requires program input |
| `report_triaged` | A report is triaged |
| `report_prioritised` | A report is prioritised by Hai (includes `high_priority` and `high_priority_reason`) |
| `report_needs_more_info` | A report requires new information |
| `report_reopened` | A report is reopened |
| `report_resolved` | A report is resolved |
| `report_closed_as_duplicate` | A report is closed as a duplicate |
| `report_closed_as_informative` | A report is closed as informative |
| `report_closed_as_spam` | A report is closed as spam |
| `report_closed_as_not_applicable` | A report is closed as not applicable |
| `report_comment_created` | A comment is created on a report |
| `report_comments_closed` | A report is locked |
| `report_custom_field_value_updated` | A report custom field value is updated |
| `report_bounty_suggested` | A bounty is suggested against a report |
| `report_bounty_awarded` | A hacker is awarded a bounty |
| `report_not_eligible_for_bounty` | A report is marked as not eligible for bounty |
| `report_swag_awarded` | A hacker is rewarded swag |
| `report_agreed_on_going_public` | A report is agreed to be publicly disclosed |
| `report_manually_disclosed` | A report is manually disclosed |
| `report_became_public` | A report is made publicly accessible |
| `report_undisclosed` | A report is undisclosed |
| `report_group_assigned` | A report is assigned to another group |
| `report_user_assigned` | A user is assigned to a report |
| `report_retesting` | A report changed to retesting |
| `report_retest_approved` | Retest results are approved |
| `report_retest_rejected` | Retest results are rejected |
| `report_retest_user_completed` | A hacker completes a retest |
| `report_retest_user_expired` | A retest user was removed from the retest due to a timeout |
| `report_retest_user_left` | A retest user left before completing |
| `program_hacker_joined` | A hacker joins your program (private programs only) |
| `program_hacker_left` | A hacker leaves your program (private programs only) |

## What Does the Payload Look Like?

Each event has a predefined payload with the relevant report information and information about the reporter. The body is JSON:API-style:

```json
{
  "data": {
    "activity": {
      "type": "activity-bug-filed",
      "id": "1337",
      "attributes": { "message": "", "created_at": "2020-02-25T08:05:21.674Z", "internal": false },
      "relationships": { "actor": { "data": { "type": "user", "attributes": { "username": "hacker" } } } }
    },
    "report": {
      "id": "548",
      "type": "report",
      "attributes": { "title": "Critical vulnerability!", "state": "new", "created_at": "2020-02-25T08:05:21.405Z" },
      "relationships": { "severity": { "data": { "attributes": { "rating": "low" } } } }
    }
  }
}
```

`data.activity.type` is an activity type, not the webhook event name, and HackerOne does not document the mapping between the two. Dispatch on `X-H1-Event`. Treat every field as untrusted and type-check before reading into it.

## Full Event Reference

See [HackerOne's webhook documentation](https://api.hackerone.com/webhooks/).
