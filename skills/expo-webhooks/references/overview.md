# Expo (EAS) Webhooks Overview

## What Are Expo EAS Webhooks?

EAS can call your server as soon as an **EAS Build** or **EAS Submit** job completes. Webhooks are configured per project with the EAS CLI. EAS sends an HTTP POST with a JSON object in the body and an `expo-signature` header you can use to verify the request.

If your endpoint responds with a status outside the 200-399 range, EAS retries a few more times with exponential back-off. Deduplicate on `id` plus `status`.

## Webhook Types and Statuses

There is no event-type field in the payload. The type (`BUILD` or `SUBMIT`) is chosen with `eas webhook:create --event BUILD|SUBMIT`. Tell payloads apart by their fields.

| Webhook | Identifying fields | Triggered When | Common Use Cases |
|---------|--------------------|----------------|------------------|
| `BUILD` | `buildDetailsPageUrl`, `artifacts`, `metadata` | An EAS Build finishes, errors, or is canceled | Notify Slack, download the artifact, start QA |
| `SUBMIT` | `submissionDetailsPageUrl`, `submissionInfo` | An EAS Submit job finishes, errors, or is canceled | Notify the release channel, track store submissions |

`status` is one of `finished`, `errored`, or `canceled` in both.

## Build Payload

| Field | Description |
|-------|-------------|
| `id` | Build ID |
| `accountName`, `projectName` | Owner account and project |
| `buildDetailsPageUrl` | Link to the build on expo.dev |
| `parentBuildId` | Present for build retries |
| `platform` | `ios` or `android` |
| `status` | `finished`, `errored`, `canceled` |
| `artifacts.buildUrl` | Download URL, for successful builds |
| `metadata` | `appName`, `appVersion`, `appBuildVersion`, `buildProfile`, `distribution`, `appIdentifier`, `gitCommitHash`, `gitCommitMessage`, `sdkVersion`, `runtimeVersion`, `channel`, `message`, ... |
| `error` | `{ message, errorCode }`, for failed builds |
| `createdAt`, `enqueuedAt`, `completedAt`, `updatedAt`, `expirationDate` | ISO timestamps |
| `priority`, `resourceClass`, `maxRetryTimeMinutes` | Scheduling details |

```json
{
  "id": "147a3212-49fd-446f-b4e3-a6519acf264a",
  "accountName": "dsokal",
  "projectName": "example",
  "buildDetailsPageUrl": "https://expo.dev/accounts/dsokal/projects/example/builds/147a3212-49fd-446f-b4e3-a6519acf264a",
  "platform": "android",
  "status": "finished",
  "artifacts": { "buildUrl": "https://expo.dev/artifacts/eas/wyodu9tua2ZuKKiaJ1Nbkn.aab" },
  "metadata": { "appVersion": "1.0.2", "buildProfile": "production", "distribution": "store" }
}
```

## Submit Payload

| Field | Description |
|-------|-------------|
| `id` | Submission ID |
| `accountName`, `projectName` | Owner account and project |
| `submissionDetailsPageUrl` | Link to the submission on expo.dev |
| `parentSubmissionId` | Present for submission retries |
| `archiveUrl` | The archive that was submitted |
| `turtleBuildId` | Present when submitting a build from EAS |
| `platform` | `ios` or `android` |
| `status` | `finished`, `errored`, `canceled` |
| `submissionInfo` | `{ error: { message, errorCode }, logsUrl }`, for failed submissions |
| `createdAt`, `updatedAt`, `completedAt` | ISO timestamps |

```json
{
  "id": "0374430d-7776-44ad-be7d-8513629adc54",
  "accountName": "dsokal",
  "projectName": "example",
  "submissionDetailsPageUrl": "https://expo.dev/accounts/dsokal/projects/example/builds/0374430d-7776-44ad-be7d-8513629adc54",
  "platform": "android",
  "status": "errored",
  "submissionInfo": {
    "error": { "message": "Android version code needs to be updated", "errorCode": "SUBMISSION_SERVICE_ANDROID_OLD_VERSION_CODE_ERROR" }
  }
}
```

## Full Reference

See [Expo's webhooks documentation](https://docs.expo.dev/eas/webhooks/).
