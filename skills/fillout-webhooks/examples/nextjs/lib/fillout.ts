// Generated with: fillout-webhooks skill
// https://github.com/hookdeck/webhook-skills
import crypto from 'crypto';

// Fillout does NOT sign webhooks: there is no signature header and no HMAC.
// Authentication is the custom header you add in Fillout under
// Integrate > Webhook > Advanced > Headers:  Authorization: Bearer <token>
// Compare the WHOLE header value against `Bearer ${FILLOUT_WEBHOOK_TOKEN}`.
export function verifyFilloutAuth(
  authorizationHeader: string | null | undefined,
  token: string | undefined
): boolean {
  if (!token) return false; // fail closed when the token is not configured
  if (typeof authorizationHeader !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(authorizationHeader).digest();
  const b = crypto.createHash('sha256').update(`Bearer ${token}`).digest();
  return crypto.timingSafeEqual(a, b);
}

// Field names from Fillout's submission schema
export interface FilloutQuestion {
  id: string;
  name: string;
  type: string;
  value: unknown;
}

export interface FilloutSubmission {
  submissionId: string;
  submissionTime: string;
  lastUpdatedAt?: string;
  questions: FilloutQuestion[];
  calculations?: { id: string; name: string; type: string; value: string }[];
  urlParameters?: { id: string; name: string; value: string }[];
  scheduling?: {
    id: string;
    name: string;
    value: { fullName: string; email: string; timezone: string; eventStartTime: string; eventEndTime: string };
  }[];
  payments?: { id: string; name: string; value: { paymentId?: string; totalAmount?: number; currency?: string } }[];
  quiz?: { score: number; maxScore: number };
  login?: { email: string };
}

export type FilloutPayload =
  | { kind: 'submission'; submission: FilloutSubmission }
  | { kind: 'mapped'; fields: Record<string, unknown> };

// Fillout has no event types; every delivery is a form submission. The body is
// either the full submission (Simple mode / API-created webhooks) or, in
// Advanced mode, a flat object of the keys you mapped in the Body section.
export function parseFilloutPayload(body: Record<string, unknown>): FilloutPayload {
  const submission =
    body.submission && typeof body.submission === 'object'
      ? (body.submission as Record<string, unknown>)
      : body;
  if (Array.isArray(submission.questions)) {
    return { kind: 'submission', submission: submission as unknown as FilloutSubmission };
  }
  return { kind: 'mapped', fields: body };
}

// Look answers up by question id: the question `name` is its text and changes
// when someone edits the form.
export function answersById(questions: FilloutQuestion[]): Record<string, unknown> {
  return Object.fromEntries(questions.map((q) => [q.id, q.value]));
}

// Retry integration, resubmits and edits all resend the same submissionId.
export function dedupeKey(payload: FilloutPayload): string | null {
  if (payload.kind === 'submission') {
    const { submissionId, lastUpdatedAt } = payload.submission;
    return submissionId ? `${submissionId}:${lastUpdatedAt ?? ''}` : null;
  }
  return payload.fields.submissionId ? String(payload.fields.submissionId) : null;
}
