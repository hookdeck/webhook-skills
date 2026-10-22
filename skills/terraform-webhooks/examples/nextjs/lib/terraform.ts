import crypto from 'crypto';

/**
 * Verify an HCP Terraform / Terraform Enterprise notification signature.
 *
 * For generic notifications with a token set, HCP Terraform sends
 * X-TFE-Notification-Signature: the hex HMAC-SHA512 of the RAW request body,
 * keyed with the notification configuration's token.
 */
export function verifyTerraformSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  token: string | undefined
): boolean {
  if (!signatureHeader || !token) {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', token)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatches.
  try {
    const received = Buffer.from(signatureHeader.toLowerCase());
    const expectedBuf = Buffer.from(expected);
    return received.length === expectedBuf.length && crypto.timingSafeEqual(received, expectedBuf);
  } catch {
    return false;
  }
}

export interface TerraformPayload {
  payload_version?: number | string;
  notification_configuration_id?: string;
  // Run payloads
  run_id?: string | null;
  run_url?: string | null;
  workspace_name?: string | null;
  notifications?: Array<{ message?: string; trigger: string; run_status?: string | null }>;
  // Workspace (assessment / auto destroy) payloads
  trigger?: string;
  message?: string;
  details?: { workspace_name?: string };
  // Team change request payloads
  change_request_url?: string;
}

/**
 * List the triggers carried by a payload.
 * - Run payloads (payload_version 1) have a notifications[] array.
 * - Workspace payloads (payload_version "2") have a top-level trigger.
 * - Change request payloads have no trigger; they are team:change_request.
 */
export function getTriggers(payload: TerraformPayload): string[] {
  if (Array.isArray(payload.notifications)) {
    return payload.notifications.map((n) => n.trigger);
  }
  if (payload.trigger) {
    return [payload.trigger];
  }
  if (payload.change_request_url) {
    return ['team:change_request'];
  }
  return [];
}
