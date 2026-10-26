// Generated with: vellum-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyVellumRequest } from '../../../lib/verify-vellum';

interface VellumEvent {
  id?: string;
  name?: string;
  body?: {
    workflow_class?: { name?: string };
    error?: { code?: string; message?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// In-memory dedupe on the event id. Use a shared store (Redis, database) in production.
const seen = new Set<string>();

function handleEvent(payload: VellumEvent): void {
  const { name, body } = payload;

  switch (name) {
    case 'workflow.execution.initiated':
      console.log(`Workflow execution initiated: ${body?.workflow_class?.name}`);
      // TODO: record the run start (body.inputs)
      break;

    case 'workflow.execution.fulfilled':
      console.log(`Workflow execution fulfilled: ${body?.workflow_class?.name}`);
      // TODO: store the result (body.outputs)
      break;

    case 'workflow.execution.rejected':
      console.log(`Workflow execution rejected: ${body?.error?.code} ${body?.error?.message}`);
      // TODO: alert on the failure (body.error)
      break;

    case 'workflow_execution.usage_calculation.fulfilled':
    case 'workflow.usage_calculation.fulfilled':
      console.log('Workflow usage calculated');
      // TODO: record cost (body.usage, body.cost)
      break;

    case 'workflow_execution.usage_calculation.rejected':
      console.log('Workflow usage calculation failed');
      // TODO: flag the run for re-calculation
      break;

    case 'metric.execution.fulfilled':
      console.log('Metric execution fulfilled');
      // TODO: store the metric result (body)
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

// Vellum's docs don't name the HTTP method, so every method is accepted. Authenticate first,
// then read the body as text so any content type works.
async function handle(request: NextRequest) {
  if (!verifyVellumRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.trim() === '') {
    return NextResponse.json({ received: true }); // empty body: nothing to process
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

  const event = payload as VellumEvent;
  if (event.id) {
    if (seen.has(event.id)) return NextResponse.json({ received: true, duplicate: true });
    seen.add(event.id);
  }

  try {
    handleEvent(event);
  } catch (err) {
    if (event.id) seen.delete(event.id); // let a retry reprocess it
    console.error('Error handling Vellum event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
