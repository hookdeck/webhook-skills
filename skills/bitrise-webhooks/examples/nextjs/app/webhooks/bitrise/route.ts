// Generated with: bitrise-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyBitriseRequest } from '../../../lib/verify-bitrise';

interface BitrisePayload {
  trigger_event?: string;
  release_id?: string;
  [key: string]: unknown;
}

// Release Management bodies have a string trigger_event. CI build event bodies document no
// type field, so they are detected by shape.
function detectKind(payload: BitrisePayload): 'release_management' | 'ci_build' | 'unknown' {
  if (typeof payload.trigger_event === 'string') return 'release_management';
  if ('build_status' in payload || 'build_triggered_workflow' in payload || 'build_slug' in payload) {
    return 'ci_build';
  }
  return 'unknown';
}

function handleReleaseEvent(payload: BitrisePayload): void {
  const { trigger_event: event, release_id: releaseId } = payload;

  switch (event) {
    case 'app_version_added':
      console.log(`App version added to release ${releaseId}`);
      // TODO: record the new version (payload.description)
      break;

    case 'testflight_upload_started':
      console.log(`TestFlight upload started: ${payload.file_name}`);
      break;

    case 'testflight_upload_completed':
      console.log(`TestFlight upload completed: ${payload.file_name} ${payload.version} (${payload.version_code})`);
      // TODO: notify QA that the build is uploaded
      break;

    case 'testflight_upload_failed':
      console.log(`TestFlight upload failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'testflight_processing_completed':
      console.log(`TestFlight processing completed: ${payload.file_name}`);
      // TODO: announce the build to testers
      break;

    case 'testflight_processing_failed':
      console.log(`TestFlight processing failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'testflight_app_review_approved':
      console.log(`TestFlight app review approved: ${payload.testflight_beta_build_id}`);
      break;

    case 'testflight_app_review_rejected':
      console.log(`TestFlight app review rejected: ${payload.testflight_beta_build_id}`);
      // TODO: alert the release owner
      break;

    case 'google_play_upload_completed':
      console.log(`Google Play upload completed: ${payload.file_name} ${payload.version} (${payload.version_code})`);
      // TODO: notify QA that the build is uploaded
      break;

    case 'google_play_upload_failed':
      console.log(`Google Play upload failed: ${payload.file_name}`);
      // TODO: alert the release owner
      break;

    case 'app_store_review_approved':
      console.log(`App Store review approved: ${payload.version}`);
      break;

    case 'app_store_review_rejected':
      console.log(`App Store review rejected: ${payload.version} (${payload.reason})`);
      // TODO: alert the release owner
      break;

    case 'app_store_release_completed':
      console.log(`App Store release completed for release ${releaseId}`);
      // TODO: announce the release
      break;

    case 'google_play_release_completed':
      console.log(`Google Play release completed for release ${releaseId}`);
      // TODO: announce the release
      break;

    default:
      console.log(`Unhandled Release Management event: ${event}`);
  }
}

function handleCiBuildEvent(payload: BitrisePayload): void {
  const { build_slug: slug, build_status: status, build_triggered_workflow: workflow } = payload;
  console.log(`CI build event: build ${slug} workflow ${workflow} status ${status}`);
  // TODO: report build status or trigger a downstream job
}

function handleEvent(payload: BitrisePayload): void {
  switch (detectKind(payload)) {
    case 'release_management':
      return handleReleaseEvent(payload);
    case 'ci_build':
      return handleCiBuildEvent(payload);
    default:
      console.log('Unhandled Bitrise payload');
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyBitriseRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook secret header' }, { status: 401 });
  }

  let payload: unknown;
  try {
    // Read as text so any content type is accepted.
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as BitrisePayload);
  } catch (err) {
    console.error('Error handling Bitrise event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
