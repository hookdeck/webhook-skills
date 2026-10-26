# Oh Dear Webhooks Overview

## What Are Oh Dear Webhooks?

[Oh Dear](https://ohdear.app) monitors websites and applications: uptime, certificates, broken links, mixed content, DNS, scheduled tasks, application health, Lighthouse and AI checks. A team adds a webhook URL in its notification settings, and Oh Dear then calls that URL with a `POST` for every notification event it fires. The body is a JSON representation of the event.

## Delivery Rules

- Only an `HTTP 200` response counts as success. Any other status, including `301`/`302` redirects, is a failure.
- Oh Dear tries a webhook up to 3 times. A non-200 response or a timeout (3 seconds or more) three times means that event is not resent again.
- A URL that fails for 48 hours without a single success is paused and the team is emailed. Re-enable it in the notification settings once the endpoint works.
- Logs are kept for 5 days and a delivery can be resent manually. Automatic retries and manual resends keep the original `uuid`, so deduplicate on it.
- Respond quickly (well under 3 seconds): verify, queue the work, return `200`.

## Common Event Types

The `type` field at the top level of the body is the event name (a camelCase `...Notification` string).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `monitorAddedNotification` | A monitor is added | Sync monitors into internal systems |
| `httpUptimeCheckFailedNotification` | An HTTP uptime check fails | Page on-call, open an incident |
| `httpUptimeCheckRecoveredNotification` | The site recovers | Resolve the incident |
| `certificateExpiresSoonNotification` | A certificate nears expiry | Trigger renewal |
| `brokenLinksFoundNotification` | Broken links are found | Create content tickets |
| `cronFailedNotification` | A scheduled task reports failure | Alert the job owner |

The uptime types carry a monitor-kind prefix: `[monitor-type]UptimeCheckFailedNotification` and `[monitor-type]UptimeCheckRecoveredNotification`, where `[monitor-type]` is `http`, `tcp` or `ping`.

## All Documented Event Types (37)

- Monitor: `monitorAddedNotification`
- Uptime: `httpUptimeCheckFailedNotification`, `tcpUptimeCheckFailedNotification`, `pingUptimeCheckFailedNotification`, `httpUptimeCheckRecoveredNotification`, `tcpUptimeCheckRecoveredNotification`, `pingUptimeCheckRecoveredNotification`
- Performance: `performanceThresholdExceededNotification`, `performanceThresholdRecoveredNotification`, `performanceDeltaExceededNotification`
- Broken links: `brokenLinksFoundNotification`, `brokenLinksFixedNotification`
- Mixed content: `mixedContentFoundNotification`, `mixedContentFixedNotification`
- Certificate: `certificateExpiresSoonNotification`, `certificateUnhealthyNotification`, `certificateHasChangedNotification`, `certificateFixedNotification`
- DNS: `dnsIssuesFoundNotification`, `dnsRecordsChangedNotification`, `dnsIssuesFixedNotification`
- Scheduled tasks: `cronFailedNotification`, `cronNotExecutedOnTimeNotification`
- Application health: `applicationHealthProblemDetectedNotification`, `applicationHealthProblemFixedNotification`, `applicationHealthClientErrorNotification`, `applicationHealthResultsTooOldNotification`
- Sitemap: `sitemapIssuesFoundNotification`, `sitemapIssuesFixedNotification`
- DNS blocklist: `dnsBlocklistIssuesFoundNotification`, `dnsBlocklistIssuesFixedNotification`
- Domain: `domainIssuesFoundNotification`, `domainIssuesFixedNotification`
- Lighthouse: `lighthouseIssuesDetectedNotification`, `lighthouseIssuesFixedNotification`
- AI checks: `aiCheckFailedNotification`, `aiCheckSucceededNotification`

The docs' table of contents uses class-style names (`UptimeCheckFailed`, `CertificateChanged`, `CronFailed`). Those are **not** wire values. Note that one example payload on the docs page (scheduled task not on time) shows the typo `sentCronNotExutedOnTimeNotification`; the documented event name is `cronNotExecutedOnTimeNotification`.

## Event Payload Structure

Every payload shares a few top-level fields:

```json
{
  "uuid": "860e04a8-2025-4793-a45c-c9ad71710cf2",
  "type": "httpUptimeCheckFailedNotification",
  "date_time": "20180312092737",
  "result_url": "https://ohdear.app/monitors/1/check/uptime/report/2"
}
```

Event-specific data (`monitor`, `run`, `check` and so on) follows. Nested objects have their own `type` keys (for example `"type": "uptime"` on a check); only the top-level `type` is the event. The `monitorAddedNotification` example in the docs has `type`, `date_time` and a `monitor` object with its `checks`.

## Full Event Reference

For every payload, see [Oh Dear's webhook documentation](https://ohdear.app/docs/integrations/webhooks).
