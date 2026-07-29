// Generated with: cloudinary-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

// Cloudinary signs each notification with your ACCOUNT API Secret and sends two
// headers:
//   x-cld-signature  -> hex digest of <algorithm>(rawBody + timestamp + api_secret)
//   x-cld-timestamp  -> unix timestamp (seconds)
// The digest algorithm is sha1 (default) or sha256 (opt-in account setting).
const ALGORITHM = process.env.CLOUDINARY_SIGNATURE_ALGORITHM || 'sha1';
cloudinary.config({
  api_secret: process.env.CLOUDINARY_API_SECRET,
  signature_algorithm: ALGORITHM,
});

// Common Cloudinary notification_type values (see references/overview.md).
export const KNOWN_EVENT_TYPES = [
  'upload',
  'eager',
  'delete',
  'rename',
  'moderation',
  'resource_tags_changed',
  'create_folder',
  'delete_folder',
] as const;

/**
 * Verify a Cloudinary webhook using the official SDK.
 *
 * Cloudinary signs the RAW request body concatenated with the timestamp and your
 * API secret, so we must pass the exact bytes received — never JSON.parse then
 * re-stringify before verifying. The SDK also rejects notifications older than
 * `valid_for` seconds (default 7200), guarding against replay.
 */
export function verifyCloudinarySignature(
  rawBody: string,
  timestamp: string | number | null,
  signature: string | null
): boolean {
  if (!rawBody || !timestamp || !signature) return false;
  return cloudinary.utils.verifyNotificationSignature(rawBody, Number(timestamp), signature);
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-cld-signature');
  const timestamp = request.headers.get('x-cld-timestamp');

  // Reject early if the signature headers are missing.
  if (!signature || !timestamp) {
    console.error('Cloudinary webhook missing x-cld-signature / x-cld-timestamp header');
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Read the RAW body: Cloudinary signs the exact bytes.
  const rawBody = await request.text();

  // Authenticate before trusting the payload.
  if (!verifyCloudinarySignature(rawBody, timestamp, signature)) {
    console.error('Cloudinary webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only parse AFTER verification succeeds.
  let notification: Record<string, unknown>;
  try {
    notification = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const notification_type = notification.notification_type as string | undefined;
  const public_id = notification.public_id as string | undefined;
  console.log(`Received Cloudinary ${notification_type} (public_id ${public_id})`);

  // Dispatch on the notification_type.
  switch (notification_type) {
    case 'upload':
      console.log('Asset uploaded:', public_id, notification.secure_url);
      break;

    case 'eager':
      console.log('Eager transformations ready:', public_id, notification.eager);
      break;

    case 'delete':
      console.log('Assets deleted:', notification.resources || public_id);
      break;

    case 'rename':
      console.log('Asset renamed:', notification.from_public_id, '->', notification.to_public_id);
      break;

    case 'moderation':
      // A moderation result is available (manual or add-on moderation).
      console.log('Moderation result:', public_id, notification.moderation_status);
      // TODO: Approve/reject the asset based on moderation_status.
      break;

    case 'resource_tags_changed':
      console.log('Tags changed:', notification.resources);
      break;

    case 'create_folder':
      console.log('Folder created:', notification.folder_path || notification.folder);
      break;

    case 'delete_folder':
      console.log('Folder deleted:', notification.folder_path || notification.folder);
      break;

    default:
      // Unknown/new type: acknowledge with 200 so Cloudinary does not retry.
      console.log(`Unhandled Cloudinary notification_type: ${notification_type}`);
  }

  // Respond 2xx quickly. A non-2xx makes Cloudinary retry.
  return NextResponse.json({ received: true });
}
