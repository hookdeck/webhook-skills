# 360Learning Webhooks Overview

## What Are 360Learning Webhooks?

360Learning webhooks push near real-time notifications (within seconds to minutes) to your URL when something happens on your 360Learning platform, so you don't have to poll API v2. Typical uses: provision users in downstream tools on `user.created`, sync completions to an HRIS on `course.attempt.closed` or `path.session.user.status.updated`, store certificates on `user.certificate.awarded`.

- A **subscription** is one event type plus one endpoint URL. Create it in Settings > Webhooks or with `POST /api/v2/webhooks/subscriptions`.
- Every subscription has its **own signing secret** (see [setup.md](setup.md)).
- Events are delivered through Svix and signed in the Standard Webhooks format (see [verification.md](verification.md)).

## Payload Envelope

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | The event type, e.g. `user.created` |
| `timestamp` | integer | When the action occurred, in Unix epoch **milliseconds** |
| `data` | object | Event-specific fields |

```json
{
  "type": "path.session.user.status.updated",
  "timestamp": 1748346292000,
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "pathId": "507f1f77bcf86cd799439012",
    "sessionId": "507f1f77bcf86cd799439013",
    "enrollmentId": "507f1f77bcf86cd799439014",
    "status": "successful",
    "updatedAt": "2025-06-13T12:10:50.568Z"
  }
}
```

**xAPI events are the exception.** `xapi` and `xapi.started` send an xAPI statement (`id`, `actor`, `verb`, `object`, `context`, `timestamp` as an ISO 8601 string) with no `type` or `data`. `actor` identifies the learner by `mbox` (`mailto:...`), or by `account.name` when the company allows username login; `object.id` is `urn:360learning:course:{id}`.

IDs are 24-character hex ObjectIds and dates are ISO 8601 UTC strings.

## Event Catalog

The 54 event types from the `eventType` enum of [Create a webhook subscription](https://360learning.readme.io/reference/v2webhooksubscriptionscreatesubscriptioncontroller_createsubscription), with descriptions from the Webhook API event pages.

### Users

| Event | Fired when | `data` fields |
|-------|------------|---------------|
| `user.created` | A user is created as active | `userId`, `firstName`, `lastName`, `mail`, `username`, `createdAt` |
| `user.invited` | A user is invited | `userId`, `firstName`, `lastName`, `mail`, `username`, `createdFrom`, `invitedAt` |
| `user.activated` | A user is activated for the first time | `userId`, `firstName`, `lastName`, `mail`, `username`, `createdFrom`, `firstActivatedAt` |
| `user.updated` | Any of mail, username, firstName, lastName, lang, custom, job, organization, phone, toBeDeactivatedAt, primaryGroupId change | `userId`, the changed fields, `updatedAt` |
| `user.deleted` | A user is soft deleted | `userId`, `firstName`, `lastName`, `mail`, `username`, `deletedAt` |
| `user.reactivated` | A user is reactivated | `userId`, `firstName`, `lastName`, `mail`, `username`, `createdFrom`, `reactivatedAt` |
| `user.assessment.corrected` | An assessment in a path is corrected | `userId`, `assessmentId`, `name`, `pathId`, `sessionId`, `enrollmentId`, `success`, `score`, `correctedAt` |
| `user.certificate.awarded` | A user certificate is awarded | `userId`, `certificateId`, `certificateOutlineId`, `deliveryDate`, `pathId`, `pathSessionId` |
| `user.customfield.created` | A user custom field is created | `customFieldId`, `name`, `type`, `createdAt` |
| `user.customfield.updated` | A user custom field is renamed (case or spacing changes alone don't fire it) | `customFieldId`, `name`, `updatedAt` |
| `user.customfield.deleted` | A user custom field is deleted (no value-update events are sent for the cascade) | `customFieldId`, `name`, `type`, `deletedAt` |
| `user.customfield.values.updated` | Custom field values of one or more users change (sent in batches, so one change can arrive as several events) | `users[]` with `userId`, `changedAt`, `fields[]` |
| `user.classroom.slot.registered` | A user registers or is registered to a classroom slot | `pathSessionId`, `classroomSlotId`, `userId`, `registrationRequesterId`, `registeredAt` |
| `user.classroom.slot.unregistered` | A user unregisters or is unenrolled from a classroom slot | `pathSessionId`, `classroomSlotId`, `userId`, `unregisteredAt` |
| `user.classroom.slot.rsvp.going.yes` | A 'yes' RSVP is submitted for a registered learner | `classroomSlotId`, `pathSessionId`, `rsvpAt`, `userId` |
| `user.classroom.slot.rsvp.going.no` | A 'no' RSVP is submitted for a registered learner | `classroomSlotId`, `pathSessionId`, `rsvpAt`, `userId` |

### Paths and Path Sessions

| Event | Fired when | `data` fields |
|-------|------------|---------------|
| `path.created` | A path is created | `pathId`, `createdAt` |
| `path.updated` | A path is updated; `changeType` is `authors`, `certificate`, `duration`, `group`, `requirements`, `settings` or `steps` (more may be added) | `pathId`, `name`, `changeType`, `updatedAt` |
| `path.archived` | A path is archived | `pathId`, `archivedAt`, `name` |
| `path.deleted` | A path is deleted | `pathId`, `deletedAt`, `name` |
| `path.session.added` | A session is added to a path (top-level sessions only) | `pathId`, `sessionId`, `name`, `createdAt` |
| `path.session.removed` | A session is removed from a path (top-level sessions only) | `pathId`, `sessionId`, `name`, `deletedAt` |
| `path.session.users.enrolled` | Users are enrolled in a path session (no user IDs: call List all enrollments) | `pathId`, `sessionId`, `enrolledAt` |
| `path.session.users.unenrolled` | Users are unenrolled from a path session | `pathId`, `sessionId`, `unenrolledAt` |
| `path.session.user.status.updated` | A learner's status in a path session changes, once per transition and the first time it is computed | `userId`, `pathId`, `sessionId`, `enrollmentId`, `status`, `updatedAt` |
| `paths.skills.added` | Skills are added to paths | `pathIds`, `skillIds`, `addedAt` |
| `paths.skills.removed` | Skills are removed from paths | `pathIds`, `skillIds`, `removedAt` |

`status` on `path.session.user.status.updated` is one of `awaitingCorrection`, `late`, `notEnrolled`, `notYetStarted`, `onTime`, `sessionNotOpened`, `successful`, `toRetake`, `unsuccessful`.

### Classroom Slots

| Event | Fired when | `data` fields |
|-------|------------|---------------|
| `path.session.classroom.slot.created` | A slot is created in a classroom session | `classroomId`, `pathSessionId`, `classroomSlotId`, `createdAt` |
| `path.session.classroom.slot.updated` | A slot is updated in a classroom session | `classroomId`, `pathSessionId`, `classroomSlotId`, `updatedAt` |
| `path.session.classroom.slot.deleted` | A slot is deleted (not when the whole classroom is removed) | `classroomId`, `pathSessionId`, `classroomSlotId`, `deletedAt` |
| `path.session.classroom.slot.users.unregistered.full` | Learners leave a full classroom slot | `classroomSlotId`, `learnerIds`, `pathSessionId`, `leftAt` |
| `path.session.classroom.slot.waitlist.opened` | A waitlist is added to a classroom slot | `classroomSlotId`, `createdBy`, `pathSessionId`, `openedAt` |
| `path.session.classroom.slot.waitlist.closed` | A classroom slot's waitlist is closed | `classroomSlotId`, `pathSessionId`, `closedAt` |
| `path.session.classroom.slot.waitlist.user.joined` | A learner joins a classroom slot waitlist | `classroomSlotId`, `learnerId`, `pathSessionId`, `joinedAt` |
| `classroom.slot.attendance.sheet.signed` | A trainer signs the attendance sheet | `attendanceSheetId`, `classroomSlotId`, `signedBy`, `signedAt` |

### Courses and Skills

| Event | Fired when | `data` fields |
|-------|------------|---------------|
| `course.attempt.closed` | A learner finishes a course attempt (`reason: "learnerFinished"`; more reasons may be added) | `attemptId`, `closedAt`, `userId`, `courseId`, `reason`, `context.pathId`, `context.pathSessionId` |
| `courses.skills.added` | Skills are added to courses | `courseIds`, `skillIds`, `addedAt` |
| `courses.skills.removed` | Skills are removed from courses | `courseIds`, `skillIds`, `removedAt` |
| `skill.created` | A skill is created individually (bulk creations don't fire it) | `skillId`, `name`, `createdAt` |
| `skill.updated` | A skill is updated individually | `skillId`, `name`, `updatedAt` |
| `skill.deleted` | A skill is deleted individually | `skillId`, `name`, `deletedAt` |

### Groups

| Event | Fired when | `data` fields |
|-------|------------|---------------|
| `group.created` | A group is created | `groupId`, `createdAt`, `name` |
| `group.updated` | Group settings change (public, parentId, name, custom, images, subdomain, url, legal texts) | `groupId`, `updatedAt`, `name`, the changed fields |
| `group.deleted` | A group is deleted | `groupId`, `deletedAt`, `name` |
| `groups.library.courses.added` | Courses are added to one or more groups' library | `groupIds`, `courseIds`, `addedAt` |
| `groups.library.courses.removed` | Courses are removed from one or more groups' library | `groupIds`, `courseIds`, `removedAt` |
| `groups.library.paths.added` | Paths are added to one or more groups' library | `groupIds`, `pathIds`, `addedAt` |
| `groups.library.paths.removed` | Paths are removed from one or more groups' library | `groupIds`, `pathIds`, `removedAt` |
| `groups.catalog.courses.added` | Courses are added to one or more groups' catalog | `groupIds`, `courseIds`, `addedAt` |
| `groups.catalog.path.sessions.added` | Path sessions are added to one or more groups' catalog | `groupIds`, `pathSessionIds`, `addedAt` |

Large group library/catalog changes can be split across several events.

### Bulk Operations and xAPI

| Event | Fired when | Fields |
|-------|------------|--------|
| `bulk.operation.created` | A bulk operation is created through the API | `bulkOperationId`, `type`, `createdAt` |
| `bulk.operation.ended` | A bulk operation ends | `bulkOperationId`, `type`, `createdAt`, `endedAt`, `status` (`completed`, `error`) |
| `xapi.started` | A learner starts a course | xAPI statement with verb `http://adlnet.gov/expapi/verbs/initialized` |
| `xapi` | Any xAPI event occurs | xAPI statement |

## Delivery and Retries

- Respond with `2xx` within **15 seconds**. Any other status, including `3xx` redirects, is a failure.
- Up to **8 attempts** per event: immediately, then after 5 s, 5 min, 30 min, 2 h, 5 h, 10 h and 10 h (about 27 h 35 min in total).
- After the last attempt the event is marked failed. Events are retained for 90 days; resend failed ones with `POST /api/v2/webhooks/subscriptions/{id}/events/retry-failure` (up to 3 days of events per request; see [setup.md](setup.md#retrying-events)).
- If every attempt fails for **5 days**, the subscription is set to `inactive`.
- `webhook-id` stays the same across retries: dedupe on it. `webhook-timestamp` is the time of each attempt.
- 360Learning recommends reconciling with API v2 periodically (for example weekly), since no webhook system guarantees 100% delivery.

## Full Event Reference

- [Webhooks guide](https://360learning.readme.io/docs/webhooks)
- [Event payload and headers](https://360learning.readme.io/docs/event-payload-and-headers)
- [Webhook API reference](https://360learning.readme.io/reference/v2webhooksubscriptionsgeteventscontroller_getevents) (events listed per resource)
