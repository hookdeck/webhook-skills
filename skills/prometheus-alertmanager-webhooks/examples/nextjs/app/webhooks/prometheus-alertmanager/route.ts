// Generated with: prometheus-alertmanager-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAlertmanagerRequest } from '../../../lib/verify-alertmanager';
import { seen } from '../../../lib/seen';

interface Alert {
  status?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
  generatorURL?: string;
  fingerprint?: string;
}

interface AlertGroup {
  version?: string;
  groupKey?: string;
  truncatedAlerts?: number;
  status?: string;
  receiver?: string;
  alerts?: Alert[];
  [key: string]: unknown;
}

function alertKey(groupKey: string | undefined, alert: Alert): string {
  return [groupKey, alert.fingerprint, alert.status, alert.startsAt, alert.endsAt].join('|');
}

function handleAlert(alert: Alert, group: AlertGroup): void {
  const name = alert.labels?.alertname ?? 'unknown';

  if (alert.status === 'firing') {
    console.log(`Alert firing: ${name} (${alert.fingerprint}) on receiver ${group.receiver}`);
    // TODO: page on-call or open an incident (alert.labels, alert.annotations)
  } else if (alert.status === 'resolved') {
    console.log(`Alert resolved: ${name} (${alert.fingerprint})`);
    // TODO: close the matching incident
  } else {
    console.log(`Unhandled alert status: ${alert.status}`);
  }
}

// status is a state, not an event type: loop over alerts[] and use each alert's own status.
function handleGroup(payload: AlertGroup): void {
  if (payload.truncatedAlerts && payload.truncatedAlerts > 0) {
    console.warn(`${payload.truncatedAlerts} alerts were truncated by max_alerts`);
  }
  for (const alert of payload.alerts ?? []) {
    const key = alertKey(payload.groupKey, alert);
    if (seen.has(key)) continue; // repeat notification (group_interval / repeat_interval)
    seen.add(key);
    handleAlert(alert, payload);
  }
}

export async function POST(request: NextRequest) {
  // Authenticate before reading or parsing the body.
  if (!verifyAlertmanagerRequest(request.headers)) {
    return NextResponse.json(
      { error: 'Invalid or missing Authorization credentials' },
      { status: 401 }
    );
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
  const group = payload as AlertGroup;
  if (group.alerts !== undefined && !Array.isArray(group.alerts)) {
    return NextResponse.json({ error: 'Expected alerts to be an array' }, { status: 400 });
  }

  try {
    handleGroup(group);
  } catch (err) {
    console.error('Error handling Alertmanager notification:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
