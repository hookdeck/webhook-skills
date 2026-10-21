/**
 * Skill generation logic with worktree support for parallel execution
 */

import { execa } from 'execa';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
  ProviderConfig,
  GenerateOptions,
  OperationResult,
  Logger,
  TestResults,
  TestResult,
} from './types';
import { getSkillPath, getProviderPaths, skillExists } from './config';
import { runGenerateSkill } from './cli';
import { reviewAndIterate } from './reviewer';
import {
  createWorktree,
  addFiles,
  commit,
  push,
  getRepoInfo,
} from './git';
import { createPullRequest } from './github';

/**
 * Run the same structural + integration checks CI runs on provider PRs
 * (scripts/validate-provider.sh), so a skill that would fail CI is fixed
 * before it is committed.
 */
export async function runValidation(
  provider: ProviderConfig,
  options: { workingDir: string; logger: Logger; dryRun?: boolean }
): Promise<{ passed: boolean; errors: string[] }> {
  const { workingDir, logger, dryRun } = options;
  const skillName = `${provider.name}-webhooks`;

  if (dryRun) {
    logger.info(`[DRY RUN] Would run validate-provider.sh ${skillName}`);
    return { passed: true, errors: [] };
  }

  const script = join(workingDir, 'scripts', 'validate-provider.sh');
  const result = await execa('bash', [script, skillName], {
    cwd: workingDir,
    reject: false,
    timeout: 60000,
  });

  if (result.exitCode === 0) {
    return { passed: true, errors: [] };
  }

  // validate_provider prints each failure as "  - <error>"
  const errors = `${result.stdout}\n${result.stderr}`
    .split('\n')
    .map((line) => line.match(/^\s+- (.+)$/)?.[1])
    .filter((e): e is string => !!e && e !== skillName);
  return { passed: false, errors: errors.length > 0 ? errors : [result.stdout || result.stderr] };
}

/**
 * Commit message with the run's results in the body, so the evidence survives
 * when per-provider branches are merged into a batch PR.
 */
export function buildCommitMessage(
  subject: string,
  details: {
    validation?: { passed: boolean; details?: string };
    testing: { passed: boolean; details?: string };
    review: { passed: boolean; details?: string };
    iterations: number;
    issuesFound: number;
    issuesFixed: number;
    model?: string;
    cliTool?: string;
  }
): string {
  return [
    subject,
    '',
    `Generated with scripts/generate-skills.sh (${details.cliTool ?? 'claude'}, model: ${details.model ?? 'CLI default'})`,
    `Tests: ${details.testing.details ?? (details.testing.passed ? 'passed' : 'failed')}`,
    `Review: ${details.review.details ?? (details.review.passed ? 'passed' : 'failed')}`,
    `Validation: ${details.validation?.details ?? 'not run'}`,
    `Iterations: ${details.iterations}, issues found: ${details.issuesFound}, issues sent for fixing: ${details.issuesFixed}`,
  ].join('\n');
}

/**
 * Run tests for a skill
 */
export async function runTests(
  provider: ProviderConfig,
  options: { workingDir: string; logger: Logger; dryRun?: boolean }
): Promise<TestResults> {
  const { workingDir, logger, dryRun } = options;
  const skillPath = getSkillPath(provider);
  const results: TestResult[] = [];
  
  if (dryRun) {
    logger.info('[DRY RUN] Would run tests for all frameworks');
    return {
      passed: true,
      frameworks: [
        { framework: 'express', passed: true, output: '[DRY RUN]' },
        { framework: 'nextjs', passed: true, output: '[DRY RUN]' },
        { framework: 'fastapi', passed: true, output: '[DRY RUN]' },
      ],
    };
  }
  
  // Test Express
  const expressDir = join(workingDir, skillPath, 'examples', 'express');
  if (existsSync(expressDir)) {
    logger.info('Running Express tests...');
    const expressResult = await runNodeTests(expressDir, logger);
    results.push({ framework: 'express', ...expressResult });
  }
  
  // Test Next.js
  const nextjsDir = join(workingDir, skillPath, 'examples', 'nextjs');
  if (existsSync(nextjsDir)) {
    logger.info('Running Next.js tests...');
    const nextjsResult = await runNodeTests(nextjsDir, logger);
    results.push({ framework: 'nextjs', ...nextjsResult });
  }
  
  // Test FastAPI
  const fastapiDir = join(workingDir, skillPath, 'examples', 'fastapi');
  if (existsSync(fastapiDir)) {
    logger.info('Running FastAPI tests...');
    const fastapiResult = await runPythonTests(fastapiDir, logger);
    results.push({ framework: 'fastapi', ...fastapiResult });
  }
  
  const passed = results.every(r => r.passed);
  return { passed, frameworks: results };
}

/**
 * Run Node.js tests (npm test)
 * Respects the project's test runner (Jest, Vitest, etc.)
 * CI=true disables watch mode for most test runners
 */
async function runNodeTests(
  dir: string,
  logger: Logger
): Promise<{ passed: boolean; output: string; error?: string }> {
  try {
    // Install dependencies first
    await execa('npm', ['install'], { cwd: dir, reject: false, timeout: 120000 });
    
    // Run npm test - respects project's configured test runner
    // CI=true disables watch mode for Jest, Vitest, and most test runners
    const result = await execa('npm', ['test'], {
      cwd: dir,
      reject: false,
      timeout: 120000, // 2 minute timeout for tests
      env: { ...process.env, CI: 'true' },
    });
    
    if (result.exitCode !== 0) {
      return {
        passed: false,
        output: result.stdout,
        error: result.stderr,
      };
    }
    
    return { passed: true, output: result.stdout };
  } catch (error) {
    const err = error as Error;
    const isTimeout = err.message.includes('timed out');
    logger.error(`Node test error: ${isTimeout ? 'Test timed out after 2 minutes' : err.message}`);
    return { passed: false, output: '', error: err.message };
  }
}

/**
 * Run Python tests (pytest)
 */
async function runPythonTests(
  dir: string,
  logger: Logger
): Promise<{ passed: boolean; output: string; error?: string }> {
  try {
    // Create venv if needed
    const venvPath = join(dir, 'venv');
    if (!existsSync(venvPath)) {
      await execa('python3', ['-m', 'venv', 'venv'], { cwd: dir, reject: false });
    }
    
    // Install dependencies
    const pipPath = join(venvPath, 'bin', 'pip');
    await execa(pipPath, ['install', '-q', '-r', 'requirements.txt'], {
      cwd: dir,
      reject: false,
    });
    
    // Run tests
    const pytestPath = join(venvPath, 'bin', 'pytest');
    const result = await execa(pytestPath, ['test_webhook.py', '-q'], {
      cwd: dir,
      reject: false,
    });
    
    if (result.exitCode !== 0) {
      return {
        passed: false,
        output: result.stdout,
        error: result.stderr,
      };
    }
    
    return { passed: true, output: result.stdout };
  } catch (error) {
    const err = error as Error;
    logger.error(`Python test error: ${err.message}`);
    return { passed: false, output: '', error: err.message };
  }
}

/**
 * Generate a new skill for a provider using worktrees
 */
export async function generateSkill(
  provider: ProviderConfig,
  options: GenerateOptions,
  context: {
    rootDir: string;
    logger: Logger;
    logFile: string;
    worktreePath?: string;  // Pre-created worktree path (optional)
    branchName?: string;    // Pre-created branch name (optional)
    isParallel?: boolean;   // Running in parallel with other providers
  }
): Promise<OperationResult> {
  const { rootDir, logger, logFile } = context;
  const { model, cliTool } = options;
  const startTime = Date.now();
  const branchName = context.branchName || `feat/${provider.name}-webhooks`;
  
  const result: OperationResult = {
    provider: provider.name,
    command: 'generate',
    success: false,
    branch: branchName,
    phases: {
      generation: { passed: false },
      testing: { passed: false },
      review: { passed: false },
      iterations: 0,
    },
    issuesFound: 0,
    issuesFixed: 0,
    duration: 0,
    logFile,
  };
  
  let worktreePath: string | undefined = context.worktreePath;
  const worktreeProvidedExternally = !!worktreePath;
  
  try {
    // Get repo info for PR creation
    const repoInfo = await getRepoInfo(rootDir);
    if (!repoInfo && options.createPr) {
      throw new Error('Could not determine repository owner/name from git remote');
    }
    
    // Check if skill already exists in main repo
    if (skillExists(provider)) {
      throw new Error(`Skill already exists for ${provider.name}. Use 'review' command to improve it.`);
    }
    
    // Create worktree if not provided externally
    if (!worktreePath) {
      logger.info(`Creating worktree for ${provider.name}...`);
      const worktreeResult = await createWorktree(rootDir, provider.name, branchName, {
        logger,
        baseBranch: options.baseBranch,
        dryRun: options.dryRun,
      });
      
      if (!worktreeResult.success) {
        throw new Error(`Failed to create worktree: ${worktreeResult.error}`);
      }
      
      worktreePath = worktreeResult.path;
    }
    
    // Generate skill (CLI tool works in the worktree directory)
    logger.info(`Generating skill for ${provider.displayName || provider.name}...`);
    const generateResult = await runGenerateSkill(provider, {
      workingDir: worktreePath,
      logger,
      dryRun: options.dryRun,
      model,
      cliTool,
      parallel: context.isParallel,
    });
    
    result.phases.generation = {
      passed: generateResult.success,
      details: generateResult.output,
    };
    
    if (!generateResult.success) {
      throw new Error('Skill generation failed');
    }
    
    // Run tests and review (with iteration) in the worktree
    if (!options.skipTests || !options.skipReview) {
      const reviewResult = await reviewAndIterate(provider, {
        workingDir: worktreePath,
        logger,
        dryRun: options.dryRun,
        skipTests: options.skipTests,
        skipReview: options.skipReview,
        maxIterations: options.maxIterations,
        model,
        cliTool,
        parallel: context.isParallel,
      });
      
      result.phases.validation = reviewResult.validation;
      result.phases.testing = reviewResult.testing;
      result.phases.review = reviewResult.review;
      result.phases.iterations = reviewResult.iterations;
      result.issuesFound = reviewResult.issuesFound;
      result.issuesFixed = reviewResult.issuesFixed;
      
      if (!reviewResult.success) {
        throw new Error('Tests or review failed after max iterations');
      }
    } else {
      // No fix loop, but still run the CI checks so the result is honest
      const validation = await runValidation(provider, { workingDir: worktreePath!, logger, dryRun: options.dryRun });
      result.phases.validation = {
        passed: validation.passed,
        details: validation.passed ? 'Passed' : `Failed: ${validation.errors.join('; ')}`,
      };
      result.phases.testing = { passed: true, details: 'Skipped' };
      result.phases.review = { passed: true, details: 'Skipped' };
      if (!validation.passed) {
        throw new Error(`validate-provider.sh failed: ${validation.errors.join('; ')}`);
      }
    }
    
    // Commit only the provider's own paths: skills/<skill>/ and
    // providers/<name>.yaml. README.md and marketplace.json are regenerated by
    // the Sync Catalog workflow after merge, so branches in a batch never
    // conflict. git add is a no-op for unmodified paths.
    await addFiles(worktreePath, getProviderPaths(provider), { logger, dryRun: options.dryRun });
    await commit(
      worktreePath,
      buildCommitMessage(`feat: add ${provider.name}-webhooks skill`, {
        ...result.phases,
        issuesFound: result.issuesFound,
        issuesFixed: result.issuesFixed,
        model,
        cliTool,
      }),
      { logger, dryRun: options.dryRun }
    );
    
    if (options.createPr && repoInfo) {
      await push(worktreePath, branchName, { logger, dryRun: options.dryRun });
      
      const prBody = buildPrBody(provider, result);
      const isDraft = options.createPr === 'draft';
      const pr = await createPullRequest({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        title: `feat: add ${provider.name}-webhooks skill`,
        body: prBody,
        head: branchName,
        base: options.baseBranch,
        draft: isDraft,
        logger,
        dryRun: options.dryRun,
      });
      
      result.prUrl = pr.prUrl;
    } else {
      // No PR - inform user about worktree location
      logger.info(`Changes committed locally (no PR created)`);
      logger.info(`  Branch: ${branchName}`);
      logger.info(`  Path: ${worktreePath}`);
      logger.info(`To push and create PR manually:`);
      logger.info(`  cd ${worktreePath} && git push -u origin HEAD`);
      logger.info(`  gh pr create`);
    }
    
    result.success = true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Generation failed: ${err.message}`);
    result.error = err.message;
  } finally {
    // Keep the worktree on failure too: generation is expensive, and the
    // review command picks up an existing worktree so the run can be resumed.
    if (!result.success && worktreePath && !options.dryRun && result.phases.generation?.passed) {
      logger.info(`Worktree kept for inspection: ${worktreePath}`);
      logger.info(`Resume with: ./scripts/generate-skills.sh review ${provider.name} --config providers`);
    }
  }
  
  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Build PR body with generation summary
 */
function buildPrBody(provider: ProviderConfig, result: OperationResult): string {
  const lines = [
    `## Summary`,
    ``,
    `Add webhook skill for ${provider.displayName || provider.name}.`,
    ``,
    `## Generation Details`,
    ``,
    `- **Provider:** ${provider.displayName || provider.name}`,
    `- **Tests passed:** ${result.phases.testing.passed ? 'Yes' : 'No'}`,
    `- **Review passed:** ${result.phases.review.passed ? 'Yes' : 'No'}`,
    `- **Iterations:** ${result.phases.iterations}`,
    `- **Issues found:** ${result.issuesFound}`,
    `- **Issues fixed:** ${result.issuesFixed}`,
  ];
  
  if (provider.docs?.webhooks) {
    lines.push(``, `## Documentation Reference`, ``, `- ${provider.docs.webhooks}`);
  }
  
  // Report what actually ran, not a fixed checklist: a skipped review or a
  // skipped test phase must not read as verified.
  const tested = result.phases.testing.passed && result.phases.testing.details !== 'Skipped';
  const reviewed = result.phases.review.passed && result.phases.review.details !== 'Skipped';
  lines.push(
    ``,
    `## Automated Verification`,
    ``,
    `- [${tested ? 'x' : ' '}] Example tests (Express, Next.js, FastAPI): ${result.phases.testing.details ?? 'not run'}`,
    `- [${reviewed ? 'x' : ' '}] AI review against provider docs: ${result.phases.review.details ?? 'not run'}`,
    `- [${result.phases.validation?.passed ? 'x' : ' '}] \`validate-provider.sh\` (required files, providers/ entry with testScenario and catalog.summary): ${result.phases.validation?.details ?? 'not run'}`,
    ``,
    `## Manual Testing (Optional)`,
    ``,
    `- [ ] Test with real webhook events from provider dashboard`,
  );
  
  return lines.join('\n');
}
