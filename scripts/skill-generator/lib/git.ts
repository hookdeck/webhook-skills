/**
 * Git operations using simple-git library with worktree support for parallel execution
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import type { Logger } from './types';

const WORKTREES_DIR = '.worktrees';

/**
 * Create a SimpleGit instance for a directory
 */
function createGit(cwd: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: cwd,
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: true,
  };
  return simpleGit(options);
}

/**
 * Get the worktrees directory path
 */
export function getWorktreesDir(rootDir: string): string {
  return join(rootDir, WORKTREES_DIR);
}

/**
 * Get the worktree path for a provider
 */
export function getWorktreePath(rootDir: string, provider: string): string {
  return join(getWorktreesDir(rootDir), provider);
}

/**
 * Ensure the worktrees directory exists
 */
function ensureWorktreesDir(rootDir: string): void {
  const dir = getWorktreesDir(rootDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a worktree for a provider with a new branch
 */
export async function createWorktree(
  rootDir: string,
  provider: string,
  branchName: string,
  options: { logger: Logger; baseBranch?: string; dryRun?: boolean }
): Promise<{ path: string; success: boolean; error?: string }> {
  const { logger, baseBranch = 'main', dryRun } = options;
  const worktreePath = getWorktreePath(rootDir, provider);
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would create worktree at ${worktreePath} with branch ${branchName}`);
    return { path: worktreePath, success: true };
  }
  
  try {
    const git = createGit(rootDir);
    
    // Fetch latest from origin
    logger.info(`Fetching latest from origin...`);
    await git.fetch('origin', baseBranch);
    
    // Remove existing worktree if it exists
    if (existsSync(worktreePath)) {
      logger.info(`Removing existing worktree at ${worktreePath}...`);
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force']);
      } catch {
        // If worktree remove fails, manually clean up
        rmSync(worktreePath, { recursive: true, force: true });
      }
    }
    
    // Ensure worktrees directory exists
    ensureWorktreesDir(rootDir);
    
    // Check if branch already exists
    const branches = await git.branch(['-a']);
    const branchExists = branches.all.some(b => 
      b === branchName || 
      b === `remotes/origin/${branchName}` ||
      b.endsWith(`/${branchName}`)
    );
    
    if (branchExists) {
      // Create worktree with existing branch
      logger.info(`Creating worktree with existing branch ${branchName}...`);
      await git.raw(['worktree', 'add', worktreePath, branchName]);
    } else {
      // Create worktree with new branch from base
      logger.info(`Creating worktree with new branch ${branchName} from origin/${baseBranch}...`);
      await git.raw(['worktree', 'add', '-b', branchName, worktreePath, `origin/${baseBranch}`]);
    }
    
    logger.success(`Worktree created at ${worktreePath}`);
    return { path: worktreePath, success: true };
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to create worktree: ${err.message}`);
    return { path: worktreePath, success: false, error: err.message };
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  rootDir: string,
  provider: string,
  options: { logger: Logger; dryRun?: boolean }
): Promise<boolean> {
  const { logger, dryRun } = options;
  const worktreePath = getWorktreePath(rootDir, provider);
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would remove worktree at ${worktreePath}`);
    return true;
  }
  
  if (!existsSync(worktreePath)) {
    return true;
  }
  
  try {
    const git = createGit(rootDir);
    await git.raw(['worktree', 'remove', worktreePath, '--force']);
    logger.info(`Removed worktree at ${worktreePath}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to remove worktree: ${err.message}`);
    // Try manual cleanup
    try {
      rmSync(worktreePath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Add files to staging in a worktree
 */
export async function addFiles(
  worktreePath: string,
  paths: string[],
  options: { logger: Logger; dryRun?: boolean }
): Promise<boolean> {
  const { logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would add files: ${paths.join(', ')}`);
    return true;
  }
  
  try {
    const git = createGit(worktreePath);
    await git.add(paths);
    logger.info(`Added files to staging: ${paths.join(', ')}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to add files: ${err.message}`);
    return false;
  }
}

/**
 * Commit changes in a worktree
 */
export async function commit(
  worktreePath: string,
  message: string,
  options: { logger: Logger; dryRun?: boolean }
): Promise<boolean> {
  const { logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would commit with message: ${message}`);
    return true;
  }
  
  try {
    const git = createGit(worktreePath);
    await git.commit(message);
    logger.info(`Committed: ${message}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to commit: ${err.message}`);
    return false;
  }
}

/**
 * Push branch to remote
 */
export async function push(
  worktreePath: string,
  branchName: string,
  options: { logger: Logger; dryRun?: boolean }
): Promise<boolean> {
  const { logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would push branch: ${branchName}`);
    return true;
  }
  
  try {
    const git = createGit(worktreePath);
    await git.push('origin', branchName, ['--set-upstream']);
    logger.info(`Pushed branch ${branchName} to origin`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to push: ${err.message}`);
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(worktreePath: string): Promise<string | undefined> {
  try {
    const git = createGit(worktreePath);
    const status = await git.status();
    return status.current || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  try {
    const git = createGit(worktreePath);
    const status = await git.status();
    return !status.isClean();
  } catch {
    return false;
  }
}

/**
 * Get repository info (owner/repo) from remote URL
 */
export async function getRepoInfo(rootDir: string): Promise<{ owner: string; repo: string } | undefined> {
  try {
    const git = createGit(rootDir);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    
    if (!origin?.refs?.fetch) {
      return undefined;
    }
    
    // Parse GitHub URL (handles both HTTPS and SSH)
    const url = origin.refs.fetch;
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    
    if (!match) {
      return undefined;
    }
    
    return { owner: match[1], repo: match[2] };
  } catch {
    return undefined;
  }
}

/**
 * Clean up all worktrees (for cleanup after run)
 */
export async function cleanupAllWorktrees(
  rootDir: string,
  options: { logger: Logger; dryRun?: boolean }
): Promise<void> {
  const { logger, dryRun } = options;
  const worktreesDir = getWorktreesDir(rootDir);
  
  if (!existsSync(worktreesDir)) {
    return;
  }
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would clean up all worktrees in ${worktreesDir}`);
    return;
  }
  
  try {
    const git = createGit(rootDir);
    await git.raw(['worktree', 'prune']);
    rmSync(worktreesDir, { recursive: true, force: true });
    logger.info('Cleaned up all worktrees');
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to clean up worktrees: ${err.message}`);
  }
}
