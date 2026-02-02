# TODO - Known Issues and Improvements

*Last updated: 2026-02-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/sendgrid-webhooks/SKILL.md**: 'blocked' is not a distinct event type but a bounce subtype. The event type table incorrectly lists it as a separate event.
  - Suggested fix: Remove the 'blocked' row from the event table or clarify it's a bounce subtype with type='blocked'
- [ ] **skills/sendgrid-webhooks/SKILL.md**: The manual verification example is missing PEM header handling that's present in all implementation examples
  - Suggested fix: Update the manual verification example to include PEM header wrapping like in the actual implementations

## Suggestions

- [ ] Consider mentioning that 'dropped' events include messages that were blocked, invalid, or unsubscribed
- [ ] The implementations handle all official SendGrid event types correctly
- [ ] All dependency versions are current and secure

