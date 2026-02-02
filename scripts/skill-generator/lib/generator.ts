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
import { getSkillPath, skillExists } from './config';
import { runGenerateSkill } from './claude';
import { reviewAndIterate } from './reviewer';
import {
  createWorktree,
  removeWorktree,
  getWorktreePath,
  addFiles,
  commit,
  push,
  getRepoInfo,
} from './git';
import { createPullRequest } from './github';

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
 */
async function runNodeTests(
  dir: string,
  logger: Logger
): Promise<{ passed: boolean; output: string; error?: string }> {
  try {
    // Install dependencies first
    await execa('npm', ['install'], { cwd: dir, reject: false });
    
    // Run tests
    const result = await execa('npm', ['test'], { cwd: dir, reject: false });
    
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
    logger.error(`Node test error: ${err.message}`);
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
  context: { rootDir: string; logger: Logger; logFile: string }
): Promise<OperationResult> {
  const { rootDir, logger, logFile } = context;
  const { model } = options;
  const startTime = Date.now();
  const branchName = `feat/${provider.name}-webhooks`;
  
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
  
  let worktreePath: string | undefined;
  
  try {
    // Get repo info for PR creation
    const repoInfo = await getRepoInfo(rootDir);
    if (!repoInfo && !options.skipPr) {
      throw new Error('Could not determine repository owner/name from git remote');
    }
    
    // Check if skill already exists in main repo
    if (skillExists(provider)) {
      throw new Error(`Skill already exists for ${provider.name}. Use 'review' command to improve it.`);
    }
    
    // Create worktree for this provider
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
    
    // Generate skill (Claude works in the worktree directory)
    logger.info(`Generating skill for ${provider.displayName || provider.name}...`);
    const generateResult = await runGenerateSkill(provider, {
      workingDir: worktreePath,
      logger,
      dryRun: options.dryRun,
      model,
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
      });
      
      result.phases.testing = reviewResult.testing;
      result.phases.review = reviewResult.review;
      result.phases.iterations = reviewResult.iterations;
      result.issuesFound = reviewResult.issuesFound;
      result.issuesFixed = reviewResult.issuesFixed;
      
      if (!reviewResult.success) {
        throw new Error('Tests or review failed after max iterations');
      }
    } else {
      result.phases.testing = { passed: true, details: 'Skipped' };
      result.phases.review = { passed: true, details: 'Skipped' };
    }
    
    // Commit and push from worktree
    const skillPath = getSkillPath(provider);
    
    await addFiles(worktreePath, [skillPath], { logger, dryRun: options.dryRun });
    await commit(worktreePath, `feat: add ${provider.name}-webhooks skill`, {
      logger,
      dryRun: options.dryRun,
    });
    
    if (!options.skipPr && repoInfo) {
      await push(worktreePath, branchName, { logger, dryRun: options.dryRun });
      
      const prBody = buildPrBody(provider, result);
      const pr = await createPullRequest({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        title: `feat: add ${provider.name}-webhooks skill`,
        body: prBody,
        head: branchName,
        base: options.baseBranch,
        logger,
        dryRun: options.dryRun,
      });
      
      result.prUrl = pr.prUrl;
    }
    
    result.success = true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Generation failed: ${err.message}`);
    result.error = err.message;
  } finally {
    // Clean up worktree (optional - could keep for debugging)
    if (worktreePath && !options.dryRun) {
      // Don't auto-cleanup on success so user can inspect
      // Only cleanup on failure
      if (!result.success) {
        logger.info('Cleaning up worktree after failure...');
        await removeWorktree(rootDir, provider.name, { logger, dryRun: options.dryRun });
      }
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
  
  lines.push(
    ``,
    `## Test Plan`,
    ``,
    `- [ ] Verify signature verification works correctly`,
    `- [ ] Test with real webhook events`,
    `- [ ] Review documentation accuracy`,
  );
  
  return lines.join('\n');
}
