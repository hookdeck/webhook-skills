// Generated with: aurora-solar-webhooks skill
// https://github.com/hookdeck/webhook-skills
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuroraSolarRequest } from '../../../lib/verify-aurora-solar';

// Every event the Aurora Solar docs list (https://docs.aurorasolar.com/reference/events).
const EVENT_LABELS: Record<string, string> = {
  agreement_download_url_job_completed: 'Agreement download URL ready',
  agreement_status_changed: 'Agreement status changed',
  ahj_lookup_completed: 'AHJ lookup completed',
  ai_roof_job_completed: 'AI Roof job completed',
  app_status_changed: 'Partner app status changed',
  asset_created: 'Asset created',
  auto_designer_job_completed: 'AutoDesigner job completed',
  consumption_profile_changed: 'Consumption profile changed',
  design_created: 'Design created',
  design_deleted: 'Design deleted',
  design_request_completed: 'Design request completed',
  design_request_created: 'Design request created',
  design_request_rejected: 'Design request rejected',
  fire_pathway_placement_job_completed: 'Fire pathway placement job completed',
  financier_contract_status_changed: 'Financier contract status changed',
  imagery_lidar_completed: 'Imagery and LiDAR completed',
  milestone_created: 'Milestone created',
  milestone_shared: 'Milestone shared',
  order_created: 'Order created',
  panel_irradiance_analysis_job_completed: 'Panel irradiance analysis completed',
  performance_simulation_job_completed: 'Performance simulation completed',
  plan_set_request_status_changed: 'Plan set request status changed',
  project_changed: 'Project changed',
  project_created: 'Project created',
  project_deleted: 'Project deleted',
  project_status_changed: 'Project status changed',
  proposal_pdf_generation_job_completed: 'Proposal PDF generated',
  site_survey_requested: 'Site survey requested',
  site_survey_status_changed: 'Site survey status changed',
  utility_bill_upload_job_completed: 'Utility bill upload completed',
  web_proposal_url_created: 'Web proposal URL created',
  web_proposal_viewed: 'Web proposal viewed',
};

function handleEvent(event: string, params: Record<string, string>): void {
  const label = EVENT_LABELS[event];
  if (!label) {
    console.log(`Unhandled event: ${event}`);
    return;
  }
  console.log(`${label}:`, params);
  // TODO: the payload is only identifiers and statuses; fetch the object from the
  // Aurora API using params.project_id / params.design_id / params.job_id.
}

// Aurora sends GET with no body; the data is in the query string.
async function handle(request: NextRequest) {
  // Authenticate first, before reading the query string.
  if (!verifyAuroraSolarRequest(request.headers)) {
    return NextResponse.json({ error: 'Invalid or missing webhook auth header' }, { status: 401 });
  }

  // Each subscription is for one event: the URL template carries a static `event`.
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    if (!(key in params)) params[key] = value; // first value wins if a key repeats
  });
  const { event } = params;
  if (!event) {
    return NextResponse.json({ error: 'Missing event query parameter' }, { status: 400 });
  }

  try {
    handleEvent(event, params);
  } catch (err) {
    console.error('Error handling Aurora Solar event:', err);
    return NextResponse.json({ error: 'Handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

// Accepted for flexibility; Aurora itself sends GET. Any body is ignored.
export async function POST(request: NextRequest) {
  return handle(request);
}
