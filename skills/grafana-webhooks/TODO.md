# TODO - Known Issues and Improvements

*Last updated: 2026-09-28*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

_None open._ The dangling timestamp-header reference in the three `.env.example`
files was fixed before merge.

## Suggestions

- [ ] Express reads SIGNATURE_HEADER / TIMESTAMP_HEADER / MAX_AGE_SECONDS once at module load, while Next.js (getConfig()) and FastAPI (get_config()) read them per request. Idiomatic for a long-lived Express process, but a short note in examples/express/src/index.js would explain the deliberate divergence.
- [ ] SKILL.md's payload example trims the docs' annotations to `description` only and omits the optional `imageURL` field. references/overview.md carries the complete shape, so this is fine, but adding `"imageURL": ""` with an 'optional' note to the SKILL.md snippet would match the Next.js GrafanaAlert interface, which already declares it.
- [ ] examples/express/src/index.js uses `express.raw({ type: '*/*' })` rather than the more common `type: 'application/json'`. This is the right call here (Extra Headers can override Content-Type, and Custom Payload can emit non-JSON) — worth a one-line comment saying so, since reviewers will expect the narrower matcher.
- [ ] Grafana's own docs page never states which response codes count as success; the '2xx = success' claim comes from grafana/alerting's client behaviour. Consider citing that in references/setup.md so the claim is traceable.
- [ ] The Test-button payload details (alertname: TestAlert, instance: Grafana, summary: Notification test) are not on the webhook-notifier docs page — they come from grafana/alerting notify/receivers.go newTestAlert. Adding that source link in references/overview.md would help future maintainers re-verify.

