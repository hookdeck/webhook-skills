/**
 * README Provider Skills table sync
 *
 * Keeps the "Provider Webhook Skills" table in README.md in sync with the
 * provider skills under `skills/`. Like the marketplace sync, this is
 * deliberately *non-destructive*: rows are hand-curated, so it only ADDS rows
 * for skills that README.md doesn't mention yet and never rewrites or reorders
 * existing ones.
 *
 * Because adding is idempotent, a merge conflict in README.md can always be
 * resolved by keeping either side and re-running the sync.
 *
 * A seeded row takes the display name and docs URL from providers.yaml and the
 * description from the first sentence of the skill's SKILL.md frontmatter; a
 * human (or the generating agent) can refine it afterwards.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { listSkillDirs } from './marketplace';
import { loadConfigFile, toDisplayName } from './config';
import type { ProviderConfig } from './types';

const ROOT_DIR = join(__dirname, '..', '..', '..');
const README_PATH = 'README.md';
const TABLE_HEADING = '### Provider Webhook Skills';

export interface ReadmeSyncResult {
  /** Provider skill directories that had no README row (and were added unless dryRun). */
  added: string[];
}

/** Provider skills are the `*-webhooks` skill directories. */
function listProviderSkillDirs(rootDir: string): string[] {
  return listSkillDirs(rootDir).filter((d) => d.endsWith('-webhooks'));
}

/**
 * Skill directories that README.md never mentions. Matches the same forms
 * validate-provider.sh accepts (`[name]` or `` `name` ``) plus a skills/ link,
 * so a row written slightly differently isn't duplicated.
 */
export function findMissingReadmeRows(rootDir: string = ROOT_DIR): string[] {
  const readme = readFileSync(join(rootDir, README_PATH), 'utf8');
  return listProviderSkillDirs(rootDir).filter(
    (d) =>
      !readme.includes(`[${d}]`) &&
      !readme.includes(`\`${d}\``) &&
      !readme.includes(`(skills/${d}/)`) &&
      !readme.includes(`(skills/${d})`)
  );
}

/** First sentence of the SKILL.md description, without the trailing period. */
function readSkillSummary(rootDir: string, skillDir: string): string {
  const content = readFileSync(join(rootDir, 'skills', skillDir, 'SKILL.md'), 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return '';
  try {
    const fm = parseYaml(match[1]) ?? {};
    const description = typeof fm.description === 'string' ? fm.description.replace(/\s+/g, ' ').trim() : '';
    const firstSentence = description.split(/(?<=\.)\s/)[0] ?? '';
    return firstSentence.replace(/\.$/, '').replace(/\|/g, '\\|');
  } catch {
    return '';
  }
}

function loadProviders(rootDir: string): Map<string, ProviderConfig> {
  const path = join(rootDir, 'providers.yaml');
  if (!existsSync(path)) return new Map();
  try {
    return loadConfigFile(path);
  } catch {
    return new Map();
  }
}

/** Build a table row for a provider skill. */
export function buildReadmeRow(
  rootDir: string,
  skillDir: string,
  providers: Map<string, ProviderConfig> = loadProviders(rootDir)
): { displayName: string; row: string } {
  const providerName = skillDir.replace(/-webhooks$/, '');
  const provider = providers.get(providerName);
  const displayName = provider?.displayName || toDisplayName(providerName);
  const docsUrl = provider?.docs?.webhooks;
  const providerCell = docsUrl ? `[${displayName}](${docsUrl})` : displayName;
  const summary = readSkillSummary(rootDir, skillDir);
  return {
    displayName,
    row: `| ${providerCell} | [\`${skillDir}\`](skills/${skillDir}/) | ${summary} |`,
  };
}

/** Display name of an existing table row (the text of its first cell, link stripped). */
function rowDisplayName(line: string): string {
  const cell = line.split('|')[1]?.trim() ?? '';
  const link = cell.match(/^\[([^\]]+)\]/);
  return (link ? link[1] : cell).toLowerCase();
}

/**
 * Add README rows for provider skills that are missing one. Rows are inserted
 * alphabetically by display name within the Provider Webhook Skills table.
 * Set `dryRun` to compute without writing.
 */
export function syncReadme(
  rootDir: string = ROOT_DIR,
  opts: { dryRun?: boolean } = {}
): ReadmeSyncResult {
  const missing = findMissingReadmeRows(rootDir);
  if (missing.length === 0) return { added: [] };

  const path = join(rootDir, README_PATH);
  const lines = readFileSync(path, 'utf8').split('\n');

  const headingIdx = lines.findIndex((l) => l.trim() === TABLE_HEADING);
  if (headingIdx === -1) {
    throw new Error(`Could not find "${TABLE_HEADING}" in ${README_PATH}`);
  }
  const headerIdx = lines.findIndex((l, i) => i > headingIdx && l.startsWith('|'));
  if (headerIdx === -1) {
    throw new Error(`Could not find the provider table under "${TABLE_HEADING}" in ${README_PATH}`);
  }
  // Rows start after the header and |---| separator lines
  const firstRowIdx = headerIdx + 2;
  let endIdx = firstRowIdx;
  while (endIdx < lines.length && lines[endIdx].startsWith('|')) endIdx++;

  const providers = loadProviders(rootDir);
  const rows = missing
    .map((d) => buildReadmeRow(rootDir, d, providers))
    .sort((a, b) => (a.displayName.toLowerCase() < b.displayName.toLowerCase() ? -1 : 1));

  // Insert from the last row upward so earlier indexes stay valid
  for (const { displayName, row } of rows.reverse()) {
    const key = displayName.toLowerCase();
    let insertAt = endIdx;
    for (let i = firstRowIdx; i < endIdx; i++) {
      if (rowDisplayName(lines[i]) > key) {
        insertAt = i;
        break;
      }
    }
    lines.splice(insertAt, 0, row);
    endIdx++;
  }

  if (!opts.dryRun) writeFileSync(path, lines.join('\n'));
  return { added: missing.slice() };
}
