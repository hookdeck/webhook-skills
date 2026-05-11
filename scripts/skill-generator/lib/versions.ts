/**
 * Query package managers for latest stable versions
 */

import { execa } from 'execa';
import type { Logger } from './types';

export interface PackageVersions {
  npm: Record<string, string>;
  pip: Record<string, string>;
}

/**
 * Generic framework deps queried for every run. Per-provider SDK packages
 * (declared via `sdks` in providers.yaml) are merged in at query time.
 */
export const NPM_PACKAGES = ['next', 'express', 'vitest', 'jest', 'typescript'];
export const PIP_PACKAGES = ['fastapi', 'pytest', 'httpx'];

/**
 * Get latest stable version from npm
 */
async function getNpmVersion(pkg: string): Promise<string | null> {
  try {
    const { stdout } = await execa('npm', ['view', pkg, 'version'], {
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get latest stable version from pip
 */
async function getPipVersion(pkg: string): Promise<string | null> {
  try {
    // pip index versions outputs: "package (version)"
    const { stdout } = await execa('pip', ['index', 'versions', pkg], {
      timeout: 10000,
    });
    const match = stdout.match(/^[\w-]+\s+\(([^)]+)\)/);
    return match ? match[1] : null;
  } catch {
    // Try pip3 if pip fails
    try {
      const { stdout } = await execa('pip3', ['index', 'versions', pkg], {
        timeout: 10000,
      });
      const match = stdout.match(/^[\w-]+\s+\(([^)]+)\)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

/**
 * Query all package versions in parallel.
 *
 * `extras` lets callers add provider-specific SDK packages (declared via the
 * `sdks` field in providers.yaml) on top of the generic framework deps. They
 * get queried in the same parallel batch and end up in the same
 * `PackageVersions` object; per-provider prompts then filter the global map
 * down to the relevant subset via `formatVersionsTableForProvider`.
 */
export async function getLatestVersions(
  extras: { npm?: string[]; pip?: string[] } = {},
  logger?: Logger,
): Promise<PackageVersions> {
  logger?.info('Querying package managers for latest versions...');

  // De-dupe so generic + per-provider lists don't double-query the same package
  const npmList = Array.from(new Set([...NPM_PACKAGES, ...(extras.npm ?? [])]));
  const pipList = Array.from(new Set([...PIP_PACKAGES, ...(extras.pip ?? [])]));

  const npmPromises = npmList.map(async pkg => {
    const version = await getNpmVersion(pkg);
    return [pkg, version] as const;
  });

  const pipPromises = pipList.map(async pkg => {
    const version = await getPipVersion(pkg);
    return [pkg, version] as const;
  });
  
  const [npmResults, pipResults] = await Promise.all([
    Promise.all(npmPromises),
    Promise.all(pipPromises),
  ]);
  
  const npm: Record<string, string> = {};
  const pip: Record<string, string> = {};
  
  for (const [pkg, version] of npmResults) {
    if (version) {
      npm[pkg] = version;
      logger?.info(`  npm ${pkg}: ${version}`);
    } else {
      logger?.warn(`  npm ${pkg}: failed to query`);
    }
  }
  
  for (const [pkg, version] of pipResults) {
    if (version) {
      pip[pkg] = version;
      logger?.info(`  pip ${pkg}: ${version}`);
    } else {
      logger?.warn(`  pip ${pkg}: failed to query`);
    }
  }
  
  return { npm, pip };
}

/**
 * Format versions as a markdown table for prompts
 */
export function formatVersionsTable(versions: PackageVersions): string {
  let table = '| Package | Latest Stable | Use in package.json/requirements.txt |\n';
  table += '|---------|---------------|--------------------------------------|\n';

  for (const [pkg, version] of Object.entries(versions.npm)) {
    // Use ^ for npm to allow minor/patch updates
    table += `| \`${pkg}\` | ${version} | \`^${version}\` |\n`;
  }

  for (const [pkg, version] of Object.entries(versions.pip)) {
    // Use >= for pip
    table += `| \`${pkg}\` | ${version} | \`>=${version}\` |\n`;
  }

  return table;
}

/**
 * Format versions for a single provider — generic framework deps plus the
 * provider's own SDKs. Used to keep prompts focused on packages relevant to
 * the skill being generated/reviewed, rather than dumping every queried SDK
 * across all providers.
 */
export function formatVersionsTableForProvider(
  versions: PackageVersions,
  sdks?: { npm?: string[]; pip?: string[] },
): string {
  const npmKeys = new Set<string>([...NPM_PACKAGES, ...(sdks?.npm ?? [])]);
  const pipKeys = new Set<string>([...PIP_PACKAGES, ...(sdks?.pip ?? [])]);

  let table = '| Package | Latest Stable | Use in package.json/requirements.txt |\n';
  table += '|---------|---------------|--------------------------------------|\n';

  for (const [pkg, version] of Object.entries(versions.npm)) {
    if (!npmKeys.has(pkg)) continue;
    table += `| \`${pkg}\` | ${version} | \`^${version}\` |\n`;
  }

  for (const [pkg, version] of Object.entries(versions.pip)) {
    if (!pipKeys.has(pkg)) continue;
    table += `| \`${pkg}\` | ${version} | \`>=${version}\` |\n`;
  }

  return table;
}

/**
 * Collect the union of all provider-declared SDKs across a config set,
 * de-duplicating across providers. Used at startup to expand the version
 * query to cover every SDK that might appear in any prompt.
 */
export function collectProviderSdks(
  providers: Array<{ sdks?: { npm?: string[]; pip?: string[] } }>,
): { npm: string[]; pip: string[] } {
  const npm = new Set<string>();
  const pip = new Set<string>();
  for (const p of providers) {
    for (const pkg of p.sdks?.npm ?? []) npm.add(pkg);
    for (const pkg of p.sdks?.pip ?? []) pip.add(pkg);
  }
  return { npm: Array.from(npm), pip: Array.from(pip) };
}

/**
 * Format versions as a simple reference for prompts
 */
export function formatVersionsReference(versions: PackageVersions): string {
  let ref = '**Current stable versions (queried from package managers):**\n\n';
  ref += 'npm packages:\n';
  for (const [pkg, version] of Object.entries(versions.npm)) {
    ref += `- ${pkg}: ^${version}\n`;
  }
  ref += '\npip packages:\n';
  for (const [pkg, version] of Object.entries(versions.pip)) {
    ref += `- ${pkg}: >=${version}\n`;
  }
  return ref;
}
