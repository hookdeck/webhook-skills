# Jamf Pro Webhooks Overview

## What Are Jamf Pro Webhooks?

Jamf Pro, Jamf's Apple device management service, can post a notification to a URL you choose
whenever an event happens on the server: a computer is enrolled, a device checks in, an inventory
update completes, the server starts. Each webhook is configured in Jamf Pro with a name, URL,
authentication type, content type (JSON or XML) and the single event it listens for. **This skill
assumes JSON.** Requests are `POST`.

Requests are not signed in a documented way. Use **Header Authentication** (a header name and
value you choose) to authenticate them. See [setup.md](setup.md) and [verification.md](verification.md).

## Common Event Types

The event name is `webhook.webhookEvent`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ComputerAdded` | A computer is enrolled into Jamf Pro | Provision accounts, sync an asset inventory |
| `ComputerCheckIn` | A managed computer checks in | Track last-seen time |
| `ComputerInventoryCompleted` | A computer finishes submitting inventory | Refresh a CMDB |
| `ComputerPatchPolicyCompleted` | A computer patch policy completes | Report patch status |
| `ComputerPolicyFinished` | A policy finishes on a computer | Alert on failures |
| `ComputerPushCapabilityChanged` | A computer's push capability changes | Flag unreachable devices |
| `DeviceAddedToDEP` | A device is added to Automated Device Enrollment | Prepare for first boot |
| `JSSStartup` | The Jamf Pro server starts | Monitoring |
| `JSSShutdown` | The Jamf Pro server shuts down | Monitoring |
| `MobileDeviceEnrolled` | A mobile device is enrolled | Assign apps, notify IT |
| `MobileDeviceUnEnrolled` | MDM profile removed or device unmanaged | Offboard the device |
| `MobileDeviceCheckIn` | A mobile device checks in | Track last-seen time |
| `MobileDeviceCommandCompleted` | An MDM command completes | Confirm a remote action |
| `MobileDeviceInventoryCompleted` | A mobile device finishes submitting inventory | Refresh a CMDB |
| `MobileDevicePushSent` | A push notification is sent to a mobile device | Audit |
| `PatchSoftwareTitleUpdated` | A patch software title is updated | Trigger patch rollouts |
| `PushSent` | A push notification is sent | Audit |
| `RestAPIOperation` | An authorized Classic API request is made | Audit configuration changes |
| `SCEPChallenge` | A SCEP challenge is requested | Certificate workflows |
| `SmartGroupComputerMembershipChange` | A computer smart group's membership changes | Sync groups elsewhere |
| `SmartGroupMobileDeviceMembershipChange` | A mobile device smart group's membership changes | Sync groups elsewhere |
| `SmartGroupUserMembershipChange` | A user smart group's membership changes | Sync groups elsewhere |

Note the spelling `MobileDeviceUnEnrolled` (capital E) in the payload.

## Event Payload Structure

```json
{
  "webhook": {
    "id": 1,
    "name": "New computers",
    "webhookEvent": "ComputerAdded",
    "eventTimestamp": 1761400000000
  },
  "event": {
    "udid": "A1B2C3D4-0000-1111-2222-333344445555",
    "deviceName": "Mac-1",
    "serialNumber": "C02XXXXXXXXX",
    "jssID": 42
  }
}
```

- `webhook` - which Jamf Pro webhook fired: `id`, `name`, `webhookEvent`, `eventTimestamp`
- `event` - event-specific data. Check the reference for the fields of each event.

If the webhook is set to send XML, the same data arrives inside a `<JSSEvent>` element. The examples
in this skill expect JSON and return `400` otherwise.

## Full Event Reference

For the complete list of events and their payloads, see the
[Jamf Pro webhooks documentation](https://learn.jamf.com/r/en-US/jamf-pro-documentation-current/Configuring_a_Webhook)
and the [Jamf developer guide](https://developer.jamf.com/developer-guide/docs/webhooks).
