/**
 * CLI wrapper for running prompts with different AI CLI tools
 */

import { execa, type ExecaError } from 'execa';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ProviderConfig, Logger, ReviewResult } from './types';
import { type PackageVersions, formatVersionsTableForProvider } from './versions';
import { getCliAdapter, DEFAULT_CLI_TOOL } from './cli-adapters';

const PROMPTS_DIR = join(__dirname, '..', 'prompts');

// Cached versions to avoid repeated queries
let cachedVersions: PackageVersions | null = null;

export function setCachedVersions(versions: PackageVersions): void {
  cachedVersions = versions;
}

export function getCachedVersions(): PackageVersions | null {
  return cachedVersions;
}

/**
 * Load a prompt template and replace placeholders
 */
export function loadPrompt(
  templateName: string,
  replacements: Record<string, string>
): string {
  const templatePath = join(PROMPTS_DIR, templateName);
  let content = readFileSync(templatePath, 'utf-8');
  
  // Simple {{KEY}} replacements
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  
  return content;
}

/**
 * Build prompt replacements from provider config
 */
export function buildPromptReplacements(provider: ProviderConfig): Record<string, string> {
  // Build the docs section based on what's provided
  let docsSection = '';
  if (provider.docs?.webhooks) {
    docsSection = `Use the following official documentation as your primary reference:\n`;
    docsSection += `- Webhooks: ${provider.docs.webhooks}\n`;
    if (provider.docs.verification) {
      docsSection += `- Verification: ${provider.docs.verification}\n`;
    }
    if (provider.docs.events) {
      docsSection += `- Events: ${provider.docs.events}\n`;
    }
    if (provider.notes) {
      docsSection += `\n**Note:** ${provider.notes}\n`;
    }
    docsSection += `\nRead these URLs and extract the information below.`;
  } else {
    docsSection = `Search for ${provider.displayName || provider.name}'s official webhook documentation.`;
  }
  
  // Build docs reference for review prompt (includes all available references)
  let docsReference = '';
  if (provider.docs) {
    const docsList: string[] = [];
    if (provider.docs.webhooks) {
      docsList.push(`- Webhooks: ${provider.docs.webhooks}`);
    }
    if (provider.docs.verification) {
      docsList.push(`- Verification: ${provider.docs.verification}`);
    }
    if (provider.docs.events) {
      docsList.push(`- Events: ${provider.docs.events}`);
    }
    if (provider.docs.api) {
      docsList.push(`- API Reference: ${provider.docs.api}`);
    }
    // Include any additional doc URLs (like reference_impl)
    for (const [key, url] of Object.entries(provider.docs)) {
      if (!['webhooks', 'verification', 'events', 'api'].includes(key) && url) {
        docsList.push(`- ${key.replace(/_/g, ' ')}: ${url}`);
      }
    }
    
    if (docsList.length > 0) {
      docsReference = `## Reference Documentation\n\nUse these official sources to verify accuracy:\n\n${docsList.join('\n')}`;
      
      if (provider.notes) {
        docsReference += `\n\n**Important context:** ${provider.notes}`;
      }
    }
  }
  
  // Build versions table from cached versions (or empty if not available).
  // Scoped to generic framework deps + this provider's declared `sdks`,
  // so the prompt doesn't dump every queried SDK across all providers.
  let versionsTable = '*Version lookup not available - use latest stable versions from npm/pip*';
  if (cachedVersions) {
    versionsTable = formatVersionsTableForProvider(cachedVersions, provider.sdks);
  }
  
  const replacements: Record<string, string> = {
    PROVIDER: provider.displayName || provider.name,
    PROVIDER_KEBAB: provider.name,
    DOCS_SECTION: docsSection,
    DOCS_REFERENCE: docsReference,
    VERSIONS_TABLE: versionsTable,
  };
  
  return replacements;
}



/**
 * Run a CLI tool with a prompt
 */
export async function runCLI(
  prompt: string,
  options: {
    workingDir: string;
    logger: Logger;
    dryRun?: boolean;
    model?: string;
    cliTool?: string;
    parallel?: boolean;  // If true, use log messages instead of in-place spinner
  }
): Promise<{ output: string; success: boolean }> {
  const { workingDir, logger, dryRun, model, cliTool = DEFAULT_CLI_TOOL, parallel = false } = options;
  
  // Get the adapter for the specified CLI tool
  const adapter = getCliAdapter(cliTool);
  const { command, args } = adapter.buildCommand({ model });
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would run ${adapter.name} (model: ${model ?? 'default'}) with prompt:`);
    logger.debug(prompt.slice(0, 500) + '...');
    return { output: '[DRY RUN] Skipped', success: true };
  }
  
  try {
    logger.info(`Running ${adapter.name} CLI (model: ${model ?? 'default'})...`);
    logger.info(`Working directory: ${workingDir}`);
    
    const startTime = Date.now();
    
    // Format elapsed time as "Xm Ys"
    const formatElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };
    
    let progressInterval: ReturnType<typeof setInterval>;
    
    if (parallel) {
      // In parallel mode, use periodic log messages (no in-place updates)
      let lastLogTime = Date.now();
      progressInterval = setInterval(() => {
        const now = Date.now();
        // Log every 30 seconds
        if (now - lastLogTime >= 30000) {
          logger.info(`Still working... (${formatElapsed()} elapsed)`);
          lastLogTime = now;
        }
      }, 5000);
    } else {
      // Single mode: use in-place spinner
      const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let spinnerIndex = 0;
      progressInterval = setInterval(() => {
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
        process.stdout.write(`\r${spinnerFrames[spinnerIndex]} Working... (${formatElapsed()} elapsed)   `);
      }, 100);
    }
    
    // Use stdin to pass the prompt - more reliable for long prompts
    // Capture output while also streaming it to console
    const subprocess = execa(command, args, {
      cwd: workingDir,
      input: prompt,  // Pass prompt via stdin
      timeout: 20 * 60 * 1000, // 20 minute timeout for Opus
      reject: false,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // Collect stdout and stderr
    let stdout = '';
    let stderr = '';
    
    if (subprocess.stdout) {
      subprocess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }
    
    if (subprocess.stderr) {
      subprocess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }
    
    const result = await subprocess;
    
    // Stop progress indicator
    clearInterval(progressInterval);
    
    if (parallel) {
      logger.success(`${adapter.name} completed in ${formatElapsed()}`);
    } else {
      process.stdout.write(`\r✓ Completed in ${formatElapsed()}                    \n`);
    }
    
    // Show CLI output (only in non-parallel mode to avoid interleaved output)
    if (stdout && !parallel) {
      console.log(`\n--- ${adapter.name} Output ---`);
      console.log(stdout);
      console.log('--- End Output ---\n');
    }
    
    if (result.exitCode !== 0) {
      logger.error(`${adapter.name} CLI failed with exit code ${result.exitCode}`);
      if (stderr) logger.error(stderr);
      return { output: stderr || stdout, success: false };
    }
    
    logger.info(`${adapter.name} CLI completed successfully`);
    return { output: stdout, success: true };
  } catch (error) {
    const execaError = error as ExecaError;
    logger.error(`${adapter.name} CLI error: ${execaError.message}`);
    return { output: execaError.message, success: false };
  }
}

/**
 * Common options for CLI operations
 */
interface CliOperationOptions {
  workingDir: string;
  logger: Logger;
  dryRun?: boolean;
  model?: string;
  cliTool?: string;
  parallel?: boolean;
  existingTodo?: string | null;  // Content from TODO.md if it exists
}

/**
 * Run CLI to generate a skill
 */
export async function runGenerateSkill(
  provider: ProviderConfig,
  options: CliOperationOptions
): Promise<{ output: string; success: boolean }> {
  const replacements = buildPromptReplacements(provider);
  const prompt = loadPrompt('generate-skill.md', replacements);
  
  return runCLI(prompt, options);
}

/**
 * Run CLI to review a skill
 */
export async function runReviewSkill(
  provider: ProviderConfig,
  options: CliOperationOptions
): Promise<{ output: string; success: boolean; reviewResult?: ReviewResult }> {
  const replacements = buildPromptReplacements(provider);
  const prompt = loadPrompt('review-skill.md', replacements);
  
  const result = await runCLI(prompt, options);

  if (!result.success) {
    return result;
  }

  // Nothing ran, so there is no verdict to parse; let the dry run walk the happy path
  if (options.dryRun) {
    return { ...result, reviewResult: { approved: true, issues: [], suggestions: [] } };
  }

  // Try to parse the review result from CLI output
  const reviewResult = parseReviewResult(result.output);
  
  return { ...result, reviewResult };
}

/**
 * Run CLI to fix issues
 */
export async function runFixIssues(
  provider: ProviderConfig,
  issuesJson: string,
  options: CliOperationOptions
): Promise<{ output: string; success: boolean }> {
  // Build TODO context section if we have existing TODO.md content
  let todoContext = '';
  if (options.existingTodo) {
    todoContext = `## Previous Issues (from TODO.md)

The following issues were identified in a previous review run. Use this context to understand what has been tried before and what still needs to be addressed:

\`\`\`markdown
${options.existingTodo}
\`\`\`

`;
  }
  
  const replacements = {
    ...buildPromptReplacements(provider),
    ISSUES_JSON: issuesJson,
    TODO_CONTEXT: todoContext,
  };
  const prompt = loadPrompt('fix-issues.md', replacements);
  
  return runCLI(prompt, options);
}

/**
 * Find the end of the balanced {...} span starting at `start`, tracking
 * string state so braces inside JSON strings are ignored. Returns -1 if the
 * span never closes.
 */
function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse review result from the CLI's output
 *
 * Reviewer replies usually contain prose with braces before the verdict
 * (e.g. "signs `{timestamp}.{body}`"), so a single greedy match from the first
 * `{` is not safe. Instead, try every balanced {...} span and keep the LAST one
 * that parses as a ReviewResult — the verdict is the end of the reply.
 * Returns undefined if no valid result is found; callers must treat that as a
 * failed review, never as an approval.
 */
export function parseReviewResult(output: string): ReviewResult | undefined {
  let result: ReviewResult | undefined;

  for (let start = output.indexOf('{'); start !== -1; start = output.indexOf('{', start + 1)) {
    const end = findObjectEnd(output, start);
    if (end === -1) continue;

    const candidate = output.slice(start, end + 1);
    if (!candidate.includes('"approved"')) continue;

    try {
      const parsed = JSON.parse(candidate) as ReviewResult;
      if (typeof parsed.approved !== 'boolean' || !Array.isArray(parsed.issues)) {
        continue;
      }
      result = {
        approved: parsed.approved,
        issues: parsed.issues,
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
      // Skip past this object so nested spans inside it aren't re-tried
      start = end;
    } catch {
      // Not JSON (e.g. a `{placeholder}` in prose) — keep scanning
    }
  }

  return result;
}
