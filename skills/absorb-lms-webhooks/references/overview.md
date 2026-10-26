# Absorb LMS Webhooks Overview

## What Are Absorb LMS Webhooks?

Absorb LMS sends an HTTP request to a listener URL you configure whenever a selected event
happens in the LMS, so an outside system can react without polling the API. Events come from
both admin actions (creating a user) and learner actions (completing a course). Only a System
Administrator can configure webhooks.

Payloads are intentionally lean: they say that something changed and give keys to look it up.
A typical payload contains:

- the event name
- the User ID of the learner who acted, or on whose behalf the action was taken
- the ID of the admin who performed the event (admin events only)
- the transaction's Client ID and Correlation ID

Absorb's article describes these fields but does not publish exact JSON key names. Dispatch on
`eventName` and use the Absorb Integration API to fetch full details (for example, a `UserCreated`
handler can GET the new learner).

## Event Names

`eventName` is the event's display name with the spaces removed, for example "User Created"
becomes `UserCreated`. Absorb's help article lists the display names below. Only
`UserCreated` and `CertificateAwarded` are confirmed on the wire (in the article's delivery
screenshots); the other names apply the same rule but are untested. Check the first real
delivery of any other event in your Absorb portal (or the Hookdeck request view) before
relying on its exact casing, and compare case-insensitively.

### Administrator events

| `eventName` | Triggered When |
|-------------|----------------|
| `UserCreated` | A user is created |
| `OnlineCourseActivated` / `OnlineCourseDeactivated` | An online course is activated or deactivated |
| `InstructorLedCourseActivated` / `InstructorLedCourseDeactivated` | An instructor-led course is activated or deactivated |
| `EnrollmentCompletedbyAdmin` | An admin completes an enrollment |
| `DepartmentCreated` / `DepartmentDeleted` | A department is created or deleted |
| `GroupCreated` / `GroupDeleted` | A group is created or deleted |
| `CurriculumActivated` / `CurriculumDeactivated` | A curriculum is activated or deactivated |
| `CourseBundleActivated` / `CourseBundleDeactivated` / `CourseBundleDeleted` | A course bundle changes state |
| `UserEnrolledinCoursebyAdmin` | An admin enrolls a user in a course |
| `UserEnrolledinSessionbyAdmin` | An admin enrolls a user in a session |

### Learner events

| `eventName` | Triggered When |
|-------------|----------------|
| `EnrollmentCompletedbyLearner` | A learner completes an enrollment |
| `CertificateAwarded` | A certificate is awarded |
| `CompetencyAwarded` | A competency is awarded |
| `CourseCreditsAwarded` | Course credits are awarded |
| `SessionEnrollmentCompleted` | A session enrollment is completed |
| `Self-AssessmentCompleted` | A self-assessment is completed (requires Skills subscription) |
| `LearningPathCompleted` | A learning path is completed (requires Skills subscription) |
| `UserEnrolledinCoursebyLearner` | A learner enrolls in a course |
| `UserEnrolledinSessionbyLearner` | A learner enrolls in a session |

## Request Headers

| Header | Purpose |
|--------|---------|
| `absorb-signature` | Lowercase hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |
| `User-Agent` | Sent on every notification; Absorb suggests using it for logging and monitoring (its value isn't documented, so don't rely on it for authentication) |

## Retries

When a delivery fails, Absorb retries it twice immediately, then shows it as **Failed** on the
Webhooks page's Events tab. An admin can then retry it manually, one delivery at a time, up to
five times. See Absorb's
[Webhooks Delivery Dashboard](https://support.absorblms.com/hc/en-us/articles/55719405215379-Webhooks-Delivery-Dashboard)
article. Because the same event can arrive more than once, make your handler idempotent.

## Full Event Reference

See Absorb's [Webhooks article](https://support.absorblms.com/hc/en-us/articles/28999993938451-Webhooks).
