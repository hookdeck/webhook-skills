/**
 * Generated catalog: README.md provider table + .claude-plugin/marketplace.json
 *
 * Both files are fully generated from sources that live next to each
 * provider, so a provider PR only touches `skills/<skill>/` and
 * `providers/<name>.yaml`, and any number of provider branches can be merged
 * without conflicts:
 *
 * - `providers/<name>.yaml` → `catalog` block: README summary, optional README
 *   docs link, and marketplace overrides (description, keywords, category).
 * - `skills/<skill>/SKILL.md` frontmatter: default marketplace description,
 *   license and repository.
 * - `scripts/skill-generator/marketplace.base.json`: marketplace top-level
 *   fields, plus hand-curated plugins that have no provider file (non-provider
 *   skills and the all-skills bundle).
 *
 * `sync` regenerates both files. On main, the "Sync Catalog" workflow runs it
 * after every merge and opens a PR with the result; contributors don't need
 * to edit README.md or marketplace.json themselves.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { loadConfigFile, PROVIDERS_DIR } from './config';
import type { ProviderConfig } from './types';

const ROOT_DIR = join(__dirname, '..', '..', '..');
const README_PATH = 'README.md';
const MANIFEST_PATH = '.claude-plugin/marketplace.json';
const BASE_PATH = 'scripts/skill-generator/marketplace.base.json';

export const README_BEGIN =
  '<!-- BEGIN GENERATED: provider-skills. Edit providers/<name>.yaml (catalog.summary), not this table. -->';
export const README_END = '<!-- END GENERATED: provider-skills -->';
const README_TABLE_HEADER = ['| Provider | Skill | What It Does |', '|----------|-------|--------------|'];

const DEFAULT_AUTHOR = { name: 'Hookdeck', email: 'phil@hookdeck.com' };
const DEFAULT_REPOSITORY = 'https://github.com/hookdeck/webhook-skills';
const DEFAULT_CATEGORY = 'integration';

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

interface MarketplaceBase {
  name: string;
  owner: Record<string, string>;
  metadata: { description?: string; [key: string]: unknown };
  /** Curated plugins; a plugin with `"skills": "{allSkills}"` gets every skill */
  plugins: Array<Omit<MarketplacePlugin, 'skills'> & { skills: string[] | string }>;
}

/** A provider file resolved to the skill directory it describes */
interface ProviderSkill {
  provider: ProviderConfig;
  skillDir: string;
}

export interface CatalogFile {
  path: string;
  content: string;
}

/** Skill directory names (those containing a SKILL.md) under skills/. */
export function listSkillDirs(rootDir: string = ROOT_DIR): string[] {
  const dir = join(rootDir, 'skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
    })
    .sort();
}

/** The skill directory a provider file describes (testScenario.skillName overrides). */
export function providerSkillDir(provider: ProviderConfig): string {
  return provider.testScenario?.skillName || `${provider.name}-webhooks`;
}

function readFrontmatter(rootDir: string, skillDir: string): Record<string, any> {
  const content = readFileSync(join(rootDir, 'skills', skillDir, 'SKILL.md'), 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return parseYaml(match[1]) ?? {};
  } catch {
    return {};
  }
}

function loadProviders(rootDir: string): ProviderSkill[] {
  const dir = join(rootDir, PROVIDERS_DIR);
  if (!existsSync(dir)) return [];
  return Array.from(loadConfigFile(dir).values()).map((provider) => ({
    provider,
    skillDir: providerSkillDir(provider),
  }));
}

function loadBase(rootDir: string): MarketplaceBase {
  return JSON.parse(readFileSync(join(rootDir, BASE_PATH), 'utf8')) as MarketplaceBase;
}

function inReadme(p: ProviderSkill): boolean {
  return p.provider.catalog?.readme !== false;
}

/**
 * Check the catalog sources are complete. Returns a list of problems; an
 * empty list means `sync` can generate both files.
 */
export function validateCatalog(rootDir: string = ROOT_DIR): string[] {
  const errors: string[] = [];
  const skills = new Set(listSkillDirs(rootDir));
  const providers = loadProviders(rootDir);
  const base = loadBase(rootDir);

  const covered = new Map<string, string>();
  for (const { provider, skillDir } of providers) {
    const file = `${PROVIDERS_DIR}/${provider.name}.yaml`;
    if (!skills.has(skillDir)) {
      errors.push(`${file}: no skill at skills/${skillDir}/ (set testScenario.skillName if the directory differs)`);
      continue;
    }
    if (covered.has(skillDir)) {
      errors.push(`${file}: skills/${skillDir}/ is already described by ${covered.get(skillDir)}`);
    }
    covered.set(skillDir, file);
    if (inReadme({ provider, skillDir }) && !provider.catalog?.summary?.trim()) {
      errors.push(`${file}: missing catalog.summary (the README "What It Does" text)`);
    }
    if (inReadme({ provider, skillDir }) && !(provider.catalog?.docsUrl || provider.docs?.webhooks)) {
      errors.push(`${file}: missing docs.webhooks (or catalog.docsUrl) for the README provider link`);
    }
  }

  for (const plugin of base.plugins) {
    if (plugin.source === './') continue;
    const skillDir = plugin.source.replace(/^\.\/skills\//, '').replace(/\/$/, '');
    if (!skills.has(skillDir)) {
      errors.push(`${BASE_PATH}: plugin "${plugin.name}" points to missing skills/${skillDir}/`);
    } else if (covered.has(skillDir)) {
      errors.push(`${BASE_PATH}: plugin "${plugin.name}" duplicates ${covered.get(skillDir)}`);
    } else {
      covered.set(skillDir, BASE_PATH);
    }
  }

  for (const skillDir of skills) {
    if (!covered.has(skillDir)) {
      errors.push(
        `skills/${skillDir}/: no catalog source (add ${PROVIDERS_DIR}/<name>.yaml, or a plugin in ${BASE_PATH} for a non-provider skill)`
      );
    }
  }

  return errors;
}

function readmeName(provider: ProviderConfig): string {
  return provider.catalog?.displayName || provider.displayName || provider.name;
}

function sortedProviderRows(providers: ProviderSkill[]): ProviderSkill[] {
  const key = (p: ProviderSkill) => readmeName(p.provider).toLowerCase();
  return providers
    .filter(inReadme)
    .sort((a, b) => (key(a) === key(b) ? (a.skillDir < b.skillDir ? -1 : 1) : key(a) < key(b) ? -1 : 1));
}

/** The generated README provider table (between the markers). */
export function buildReadmeTable(rootDir: string = ROOT_DIR): string[] {
  const rows = sortedProviderRows(loadProviders(rootDir)).map(({ provider, skillDir }) => {
    const name = readmeName(provider);
    const url = provider.catalog?.docsUrl || provider.docs?.webhooks;
    const providerCell = url ? `[${name}](${url})` : name;
    const summary = (provider.catalog?.summary ?? '').replace(/\s+/g, ' ').trim();
    return `| ${providerCell} | [\`${skillDir}\`](skills/${skillDir}/) | ${summary} |`;
  });
  return [...README_TABLE_HEADER, ...rows];
}

/** README.md with the generated provider table replaced. */
export function renderReadme(rootDir: string = ROOT_DIR): string {
  const lines = readFileSync(join(rootDir, README_PATH), 'utf8').split('\n');
  const begin = lines.indexOf(README_BEGIN);
  const end = lines.indexOf(README_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(`${README_PATH}: generated provider table markers not found:\n  ${README_BEGIN}\n  ${README_END}`);
  }
  return [...lines.slice(0, begin + 1), ...buildReadmeTable(rootDir), ...lines.slice(end)].join('\n');
}

function providerPlugin(rootDir: string, { provider, skillDir }: ProviderSkill): MarketplacePlugin {
  const fm = readFrontmatter(rootDir, skillDir);
  const overrides = provider.catalog?.marketplace ?? {};
  const repository = typeof fm.metadata?.repository === 'string' ? fm.metadata.repository : DEFAULT_REPOSITORY;
  const defaultDescription = typeof fm.description === 'string' ? fm.description.replace(/\s+/g, ' ').trim() : '';
  const defaultKeywords = Array.from(
    new Set(['webhooks', ...skillDir.replace(/-webhooks$/, '').split('-').filter(Boolean)])
  );
  return {
    name: typeof fm.name === 'string' ? fm.name : skillDir,
    description: overrides.description ?? defaultDescription,
    source: `./skills/${skillDir}`,
    strict: false,
    skills: ['./'],
    category: overrides.category ?? DEFAULT_CATEGORY,
    license: typeof fm.license === 'string' ? fm.license : 'MIT',
    author: DEFAULT_AUTHOR,
    repository,
    homepage: `${repository}/tree/main/skills/${skillDir}`,
    keywords: overrides.keywords ?? defaultKeywords,
  };
}

/**
 * The generated marketplace.json: provider plugins sorted by name, then the
 * curated plugins from marketplace.base.json in their listed order.
 */
export function buildManifest(rootDir: string = ROOT_DIR): Record<string, unknown> {
  const base = loadBase(rootDir);
  const providers = loadProviders(rootDir);
  const allSkills = listSkillDirs(rootDir);
  const providerCount = providers.filter(inReadme).length;
  const counts: Record<string, string> = {
    skillCount: String(allSkills.length),
    providerCount: String(providerCount),
    // "Stripe, Shopify, GitHub, and N others"
    otherProviderCount: String(Math.max(providerCount - 3, 0)),
  };
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (m, key) => counts[key] ?? m);

  const providerPlugins = providers
    .map((p) => providerPlugin(rootDir, p))
    .sort((a, b) => (a.name < b.name ? -1 : 1));

  const curated = base.plugins.map((plugin) => ({
    ...plugin,
    description: fill(plugin.description),
    skills: plugin.skills === '{allSkills}' ? allSkills.map((d) => `./skills/${d}`) : plugin.skills,
  }));

  const metadata = { ...base.metadata };
  if (typeof metadata.description === 'string') metadata.description = fill(metadata.description);

  return { name: base.name, owner: base.owner, metadata, plugins: [...providerPlugins, ...curated] };
}

export function renderManifest(rootDir: string = ROOT_DIR): string {
  return JSON.stringify(buildManifest(rootDir), null, 2) + '\n';
}

/** Generate both files in memory. Throws if the sources are incomplete. */
export function renderCatalog(
  rootDir: string = ROOT_DIR,
  only?: 'readme' | 'marketplace'
): CatalogFile[] {
  const errors = validateCatalog(rootDir);
  if (errors.length > 0) {
    throw new Error(`Catalog sources are incomplete:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  const files: CatalogFile[] = [];
  if (only !== 'marketplace') files.push({ path: README_PATH, content: renderReadme(rootDir) });
  if (only !== 'readme') files.push({ path: MANIFEST_PATH, content: renderManifest(rootDir) });
  return files;
}

/** Paths whose committed content differs from what `sync` would generate. */
export function findCatalogDrift(rootDir: string = ROOT_DIR, only?: 'readme' | 'marketplace'): string[] {
  return renderCatalog(rootDir, only)
    .filter((f) => readFileSync(join(rootDir, f.path), 'utf8') !== f.content)
    .map((f) => f.path);
}

/** Regenerate both files; returns the paths that changed. */
export function syncCatalog(
  rootDir: string = ROOT_DIR,
  opts: { dryRun?: boolean; only?: 'readme' | 'marketplace' } = {}
): string[] {
  const changed: string[] = [];
  for (const file of renderCatalog(rootDir, opts.only)) {
    const path = join(rootDir, file.path);
    if (readFileSync(path, 'utf8') === file.content) continue;
    changed.push(file.path);
    if (!opts.dryRun) writeFileSync(path, file.content);
  }
  return changed;
}
