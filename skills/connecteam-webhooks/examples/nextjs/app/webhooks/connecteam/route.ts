// Generated with: connecteam-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyConnecteamRequest } from '../../../lib/verify-connecteam';

interface ConnecteamPayload {
  eventType?: string;
  userId?: number;
  timeClockId?: number;
  schedulerId?: number;
  data?: unknown;
  [key: string]: unknown;
}

function handleEvent(payload: ConnecteamPayload): void {
  const { eventType } = payload;

  switch (eventType) {
    // Users
    case 'user_created':
    case 'user_updated':
    case 'user_deleted':
    case 'user_archived':
    case 'user_restored':
    case 'user_promoted':
    case 'user_demoted':
      console.log(`User event ${eventType}:`, JSON.stringify(payload.data));
      // TODO: sync payload.data[] (userId, email, isArchived) to your directory
      break;

    // Forms
    case 'form_submission':
    case 'form_submission_edited':
    case 'manager_field_updated': {
      const data = payload.data as { formSubmissionId?: string } | undefined;
      console.log(`Form event ${eventType}: submission ${data?.formSubmissionId}`);
      // TODO: process payload.data.answers
      break;
    }

    // Time clock (flat payload: userId, timeClockId at the root)
    case 'clock_in':
    case 'clock_out':
    case 'auto_clock_out':
    case 'admin_add':
    case 'admin_edit':
    case 'admin_delete':
    case 'user_timesheet_submitted':
    case 'user_timesheet_unsubmitted':
    case 'user_timesheet_approved':
    case 'user_timesheet_reopened':
      console.log(`Time activity event ${eventType}: user ${payload.userId}, clock ${payload.timeClockId}`);
      // TODO: update payroll or attendance records
      break;

    // Shift scheduler
    case 'shift_created':
    case 'shift_updated':
    case 'shift_deleted':
    case 'availability_status_created':
    case 'availability_status_deleted':
      console.log(`Scheduler event ${eventType}: scheduler ${payload.schedulerId}`);
      // TODO: sync payload.data to your calendar
      break;

    // Tasks
    case 'task_published':
    case 'task_completed':
      console.log(`Task event ${eventType}`);
      // TODO: update your task tracker from payload.data
      break;

    // Chat
    case 'message_created':
    case 'message_updated':
    case 'message_deleted':
    case 'conversation_created':
    case 'conversation_updated':
    case 'conversation_deleted':
      console.log(`Chat event ${eventType}`);
      // TODO: mirror payload.data
      break;

    default:
      console.log(`Unhandled event: ${eventType}`);
  }
}

async function handleWebhook(request: NextRequest) {
  // Check the credential first, for every method, before reading the body.
  if (!verifyConnecteamRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing x-webhook-secret' }, { status: 401 });
  }

  // Read as text so any content type is accepted; GET and friends may have no body.
  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 });
  }

  try {
    handleEvent(payload as ConnecteamPayload);
  } catch (err) {
    console.error('Error handling Connecteam event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Connecteam's docs don't name the method (the Chat guide says POST), so accept all of these.
export const GET = handleWebhook;
export const POST = handleWebhook;
export const PUT = handleWebhook;
export const PATCH = handleWebhook;
export const DELETE = handleWebhook;
