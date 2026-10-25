# Bitdefender Webhooks Overview

## What Are Bitdefender Webhooks?

Bitdefender GravityZone's **Event Push Service** sends security events from GravityZone to a
web service you run. You enable it with the `setPushEventSettings` API method and
`serviceType: "jsonRPC"` (other service types, such as `splunk`, `cef`, `qradar` and
`azureSentinel`, target SIEMs and are not covered here).

The collector must support TLS 1.2 or higher and respond with a `2xx` status; "any other
response or no response is considered an error." Events come from GravityZone's published IP
addresses, which the docs ask you to allowlist.

Payloads are not signed. The credential is the `Authorization` header (see
[verification.md](verification.md)).

## Message Shape

Events are submitted in calls to the `addEvents` function, which takes one parameter,
`events`, an array of event objects (JSON-RPC 2.0):

```json
{
  "jsonrpc": "2.0",
  "method": "addEvents",
  "params": {
    "events": [
      {
        "module": "aph",
        "companyId": "59a14b271da197c6108b4567",
        "computer_name": "FC-EXCHANGE-01",
        "aph_type": "phishing",
        "url": "http://example.com/account/support/",
        "status": "aph_blocked",
        "last_blocked": "2017-09-14T08:49:43.000Z",
        "count": 1
      }
    ]
  },
  "id": 1505378984190
}
```

## What Event Types Does Bitdefender Send?

The event type is each event's `module` value:

| `module` | Event category | Notable fields |
|----------|----------------|----------------|
| `av` | Antimalware | `malware_type`, `malware_name`, `final_status`, `file_path`, `computer_name` |
| `aph` | Antiphishing | `aph_type`, `url`, `status` (`aph_blocked`, `reportOnly`) |
| `avc` | Advanced Threat Control | `exploit_type`, `exploit_path`, `status` (`avc_blocked`, `avc_allowed`, `avc_disinfected`) |
| `fw` | Firewall | |
| `hd` | Hyper Detect | |
| `dp` | Data Protection | |
| `network-sandboxing` | Sandbox Analyzer detection | |
| `adcloud` | Cloud AD Integration | `syncerId`, `issueType` |
| `exchange-malware` | Exchange malware detection | |
| `exchange-user-credentials` | Exchange user credentials | |
| `modules` | Product modules status | |
| `registration` | Product registration | |
| `supa-update-status` | Outdated update server | |
| `sva`, `sva-load` | Security Server status / overload | |
| `antiexploit` | Antiexploit | |
| `network-monitor` | Network Attack Defense | |
| `task-status` | Task status | |
| `uc` | User Control / Content Control | |
| `install`, `uninstall` | Agent install / uninstall | |
| `hwid-change` | Hardware ID change | |
| `endpoint-moved-in`, `endpoint-moved-out` | Endpoint moved | |
| `troubleshooting-activity` | Troubleshooting activity | |
| `ransomware-mitigation` | Ransomware activity detection | |
| `new-incident`, `new-extended-incident` | New incident | |
| `incident-status-changed`, `incident-assignee-changed`, `incident-priority-changed` | Incident changes | |
| `incident-note-created`, `incident-note-updated`, `incident-note-deleted` | Incident notes | |

You choose which modules are pushed with `subscribeToEventTypes` in `setPushEventSettings`.
The event-types page also lists `exchange-organization-info`, `partner-changed` and
`integrations-hub-status`; treat the list as open and ignore modules you don't handle.

Common fields on endpoint events: `module`, `companyId`, `computer_name`, `computer_fqdn`,
`computer_ip`, `computer_id`, `product_installed`.

## Full Event Reference

- Event types: https://www.bitdefender.com/business/support/en/77209-135324-event-types.html
- Push event JSON RPC messages: https://www.bitdefender.com/business/support/en/77209-135325-push-event-json-rpc-messages.html
- setPushEventSettings: https://www.bitdefender.com/business/support/en/77209-135319-setpusheventsettings.html
