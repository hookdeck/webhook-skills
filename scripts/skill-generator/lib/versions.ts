/**
 * Query package managers for latest stable versions
 */

import { execa } from 'execa';
import type { Logger } from './types';

export interface PackageVersions {
  npm: Record<string, string>;
  pip: Record<string, string>;
}

const NPM_PACKAGES = ['next', 'express', 'vitest', 'jest', 'typescript'];
const PIP_PACKAGES = ['fastapi', 'pytest', 'httpx'];

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
 * Query all package versions in parallel
 */
export async function getLatestVersions(logger?: Logger): Promise<PackageVersions> {
  logger?.info('Querying package managers for latest versions...');
  
  const npmPromises = NPM_PACKAGES.map(async pkg => {
    const version = await getNpmVersion(pkg);
    return [pkg, version] as const;
  });
  
  const pipPromises = PIP_PACKAGES.map(async pkg => {
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
