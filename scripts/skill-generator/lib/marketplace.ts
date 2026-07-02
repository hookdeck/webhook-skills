/**
 * Marketplace manifest sync
 *
 * Keeps `.claude-plugin/marketplace.json` in sync with the skills that actually
 * exist under `skills/`. Each skill directory that contains a SKILL.md must have
 * a matching plugin entry in the manifest.
 *
 * The manifest carries hand-curated fields (short `description`, `keywords`) that
 * are intentionally richer than what the generator produces, so this module is
 * deliberately *non-destructive*: it only ADDS entries that are missing and never
 * rewrites or reorders existing ones. Existing bytes are preserved exactly (new
 * entries are spliced in as text), so adopting the tool does not churn the file.
 *
 * Curated fields for a newly added entry are seeded from the skill's SKILL.md
 * frontmatter and sensible conventions; a human can refine them afterwards.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const ROOT_DIR = join(__dirname, '..', '..', '..');
const MANIFEST_PATH = '.claude-plugin/marketplace.json';

const DEFAULT_AUTHOR = { name: 'Hookdeck', email: 'phil@hookdeck.com' };
const DEFAULT_REPOSITORY = 'https://github.com/hookdeck/webhook-skills';

export interface MarketplacePlugin {
  name: string;
  description: string;
  source: string;
  strict: boolean;
  skills: string[];
  category: string;
  license: string;
  author: { name: string; email: string };
  repository: string;
  homepage: string;
  keywords: string[];
}

export interface DriftReport {
  /** Skill directories (with a SKILL.md) that have no manifest entry. */
  missing: string[];
  /** Manifest entries whose `source` directory no longer exists. */
  orphans: string[];
}

function manifestFile(rootDir: string): string {
  return join(rootDir, MANIFEST_PATH);
}

function skillsDir(rootDir: string): string {
  return join(rootDir, 'skills');
}

/** List skill directory names (those containing a SKILL.md) under skills/. */
export function listSkillDirs(rootDir: string = ROOT_DIR): string[] {
  const dir = skillsDir(rootDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
    })
    .sort();
}

/** Parse the YAML frontmatter block from a SKILL.md file. */
function readFrontmatter(skillMdPath: string): Record<string, any> {
  const content = readFileSync(skillMdPath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return parseYaml(match[1]) ?? {};
  } catch {
    return {};
  }
}

/** Map the manifest set of plugin sources to their directory basenames. */
function manifestSourceDirs(plugins: MarketplacePlugin[]): Set<string> {
  const set = new Set<string>();
  for (const p of plugins) {
    const src = p.source ?? '';
    const m = src.match(/^\.\/skills\/([^/]+)\/?$/);
    if (m) set.add(m[1]);
  }
  return set;
}

/** Build a manifest entry for a skill directory from its SKILL.md + conventions. */
export function buildEntry(rootDir: string, skillDir: string): MarketplacePlugin {
  const fm = readFrontmatter(join(skillsDir(rootDir), skillDir, 'SKILL.md'));
  const metadata = (fm.metadata ?? {}) as Record<string, any>;
  const repository = typeof metadata.repository === 'string' ? metadata.repository : DEFAULT_REPOSITORY;
  const description =
    typeof fm.description === 'string' ? fm.description.replace(/\s+/g, ' ').trim() : '';
  const providerKeyword = skillDir.replace(/-webhooks$/, '');

  return {
    name: typeof fm.name === 'string' ? fm.name : skillDir,
    description,
    source: `./skills/${skillDir}`,
    strict: false,
    skills: ['./'],
    category: 'integration',
    license: typeof fm.license === 'string' ? fm.license : 'MIT',
    author: DEFAULT_AUTHOR,
    repository,
    homepage: `${repository}/tree/main/skills/${skillDir}`,
    keywords: Array.from(new Set(['webhooks', ...providerKeyword.split('-')])).filter(Boolean),
  };
}

/** Compare skills/ against the manifest and report drift in both directions. */
export function findManifestDrift(rootDir: string = ROOT_DIR): DriftReport {
  const raw = readFileSync(manifestFile(rootDir), 'utf8');
  const data = JSON.parse(raw) as { plugins: MarketplacePlugin[] };
  const sourced = manifestSourceDirs(data.plugins);
  const dirs = listSkillDirs(rootDir);
  const dirSet = new Set(dirs);

  const missing = dirs.filter((d) => !sourced.has(d));
  const orphans = Array.from(sourced).filter((d) => !dirSet.has(d)).sort();
  return { missing, orphans };
}

/**
 * Locate the character offset of the start of each top-level object inside the
 * `plugins` array, tracking string/brace state so nested objects are ignored.
 */
function topLevelObjectOffsets(raw: string): number[] {
  const arrStart = raw.indexOf('[', raw.indexOf('"plugins"'));
  const offsets: number[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;
  for (let i = arrStart; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') {
      depth++;
      if (depth === 1) objStart = i;
    } else if (c === '}') {
      if (depth === 1) offsets.push(objStart);
      depth--;
    } else if (c === ']' && depth === 0) {
      break;
    }
  }
  return offsets;
}

/** Serialize an entry as text indented to sit inside the 4-space plugins array. */
function renderEntryBlock(entry: MarketplacePlugin): string {
  const json = JSON.stringify(entry, null, 2);
  return json
    .split('\n')
    .map((line) => '    ' + line)
    .join('\n');
}

export interface SyncResult {
  added: string[];
  orphans: string[];
}

/**
 * Add manifest entries for any skill directories missing one, inserted
 * alphabetically within the leading alphabetically-sorted run of entries (the
 * provider-skills section). Existing entries are never modified or reordered.
 * Returns the list of added skill directories. Set `dryRun` to compute without
 * writing.
 */
export function syncManifest(
  rootDir: string = ROOT_DIR,
  opts: { dryRun?: boolean } = {}
): SyncResult {
  const path = manifestFile(rootDir);
  let raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw) as { plugins: MarketplacePlugin[] };
  const names = data.plugins.map((p) => p.name);

  const { missing, orphans } = findManifestDrift(rootDir);
  if (missing.length === 0) return { added: [], orphans };

  // The provider section is the longest strictly-increasing prefix of names;
  // the curated non-provider plugins are appended after it out of alpha order.
  let prefixLen = 1;
  while (prefixLen < names.length && names[prefixLen] > names[prefixLen - 1]) prefixLen++;
  if (names.length === 0) prefixLen = 0;

  const offsets = topLevelObjectOffsets(raw);
  const lineStart = (idx: number) => raw.lastIndexOf('\n', idx) + 1;

  // Group new entries by the anchor entry they should be inserted before.
  const entries = missing.map((d) => buildEntry(rootDir, d)).sort((a, b) => (a.name < b.name ? -1 : 1));
  const groups = new Map<number, MarketplacePlugin[]>();
  for (const entry of entries) {
    let anchor = prefixLen; // default: end of provider section (before curated group)
    for (let i = 0; i < prefixLen; i++) {
      if (names[i] > entry.name) {
        anchor = i;
        break;
      }
    }
    if (!groups.has(anchor)) groups.set(anchor, []);
    groups.get(anchor)!.push(entry);
  }

  // Apply insertions from the highest offset downward so earlier offsets stay valid.
  const anchors = Array.from(groups.keys()).sort((a, b) => b - a);
  for (const anchor of anchors) {
    const pos = lineStart(offsets[anchor]);
    const block =
      groups
        .get(anchor)!
        .map((e) => renderEntryBlock(e))
        .join(',\n') + ',\n';
    raw = raw.slice(0, pos) + block + raw.slice(pos);
  }

  // Validate before writing.
  JSON.parse(raw);
  if (!opts.dryRun) writeFileSync(path, raw);
  return { added: missing.slice(), orphans };
}
