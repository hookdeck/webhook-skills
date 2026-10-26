// Generated with: jamf-pro-webhooks skill
// https://github.com/hookdeck/webhook-skills

// The `webhook.webhookEvent` values documented by Jamf Pro.
export const EVENT_LABELS: Record<string, string> = {
  ComputerAdded: 'Computer enrolled',
  ComputerCheckIn: 'Computer checked in',
  ComputerInventoryCompleted: 'Computer inventory completed',
  ComputerPatchPolicyCompleted: 'Computer patch policy completed',
  ComputerPolicyFinished: 'Computer policy finished',
  ComputerPushCapabilityChanged: 'Computer push capability changed',
  DeviceAddedToDEP: 'Device added to Automated Device Enrollment',
  JSSShutdown: 'Jamf Pro server shut down',
  JSSStartup: 'Jamf Pro server started',
  MobileDeviceCheckIn: 'Mobile device checked in',
  MobileDeviceCommandCompleted: 'Mobile device command completed',
  MobileDeviceEnrolled: 'Mobile device enrolled',
  MobileDeviceInventoryCompleted: 'Mobile device inventory completed',
  MobileDevicePushSent: 'Mobile device push sent',
  MobileDeviceUnEnrolled: 'Mobile device unenrolled',
  PatchSoftwareTitleUpdated: 'Patch software title updated',
  PushSent: 'Push notification sent',
  RestAPIOperation: 'Classic API operation performed',
  SCEPChallenge: 'SCEP challenge requested',
  SmartGroupComputerMembershipChange: 'Computer smart group membership changed',
  SmartGroupMobileDeviceMembershipChange: 'Mobile device smart group membership changed',
  SmartGroupUserMembershipChange: 'User smart group membership changed',
};
