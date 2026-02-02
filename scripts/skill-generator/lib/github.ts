/**
 * GitHub API operations using Octokit
 */

import { Octokit } from '@octokit/rest';
import type { Logger } from './types';

let octokitInstance: Octokit | null = null;

/**
 * Get or create Octokit instance
 * Uses GITHUB_TOKEN environment variable for authentication
 */
function getOctokit(): Octokit {
  if (!octokitInstance) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    
    if (!token) {
      throw new Error(
        'GitHub token not found. Set GITHUB_TOKEN or GH_TOKEN environment variable.\n' +
        'Create a token at: https://github.com/settings/tokens'
      );
    }
    
    octokitInstance = new Octokit({ auth: token });
  }
  
  return octokitInstance;
}

/**
 * Create a pull request
 */
export async function createPullRequest(options: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;  // branch name
  base?: string; // target branch (default: main)
  logger: Logger;
  dryRun?: boolean;
}): Promise<{ success: boolean; prUrl?: string; prNumber?: number; error?: string }> {
  const { owner, repo, title, body, head, base = 'main', logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would create PR: ${title}`);
    logger.info(`[DRY RUN] ${owner}/${repo}: ${head} -> ${base}`);
    return { 
      success: true, 
      prUrl: `https://github.com/${owner}/${repo}/pull/999`,
      prNumber: 999 
    };
  }
  
  try {
    const octokit = getOctokit();
    
    logger.info(`Creating pull request: ${title}`);
    
    const response = await octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base,
    });
    
    const prUrl = response.data.html_url;
    const prNumber = response.data.number;
    
    logger.success(`Created PR #${prNumber}: ${prUrl}`);
    
    return { success: true, prUrl, prNumber };
  } catch (error) {
    const err = error as Error & { status?: number; message: string };
    
    // Check if PR already exists
    if (err.status === 422 && err.message.includes('A pull request already exists')) {
      logger.warn('Pull request already exists for this branch');
      
      // Try to find the existing PR
      try {
        const octokit = getOctokit();
        const { data: prs } = await octokit.pulls.list({
          owner,
          repo,
          head: `${owner}:${head}`,
          state: 'open',
        });
        
        if (prs.length > 0) {
          return { 
            success: true, 
            prUrl: prs[0].html_url, 
            prNumber: prs[0].number 
          };
        }
      } catch {
        // Ignore errors finding existing PR
      }
      
      return { success: true, prUrl: undefined, prNumber: undefined };
    }
    
    logger.error(`Failed to create PR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Check if a pull request exists for a branch
 */
export async function prExists(options: {
  owner: string;
  repo: string;
  branch: string;
  logger: Logger;
}): Promise<{ exists: boolean; prUrl?: string; prNumber?: number }> {
  const { owner, repo, branch, logger } = options;
  
  try {
    const octokit = getOctokit();
    
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
    });
    
    if (prs.length > 0) {
      return { exists: true, prUrl: prs[0].html_url, prNumber: prs[0].number };
    }
    
    return { exists: false };
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to check for existing PR: ${err.message}`);
    return { exists: false };
  }
}

/**
 * Add labels to a pull request
 */
export async function addLabels(options: {
  owner: string;
  repo: string;
  prNumber: number;
  labels: string[];
  logger: Logger;
  dryRun?: boolean;
}): Promise<boolean> {
  const { owner, repo, prNumber, labels, logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would add labels to PR #${prNumber}: ${labels.join(', ')}`);
    return true;
  }
  
  try {
    const octokit = getOctokit();
    
    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels,
    });
    
    logger.info(`Added labels to PR #${prNumber}: ${labels.join(', ')}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to add labels: ${err.message}`);
    return false;
  }
}

/**
 * Request reviewers for a pull request
 */
export async function requestReviewers(options: {
  owner: string;
  repo: string;
  prNumber: number;
  reviewers: string[];
  logger: Logger;
  dryRun?: boolean;
}): Promise<boolean> {
  const { owner, repo, prNumber, reviewers, logger, dryRun } = options;
  
  if (dryRun) {
    logger.info(`[DRY RUN] Would request reviewers for PR #${prNumber}: ${reviewers.join(', ')}`);
    return true;
  }
  
  try {
    const octokit = getOctokit();
    
    await octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers,
    });
    
    logger.info(`Requested reviewers for PR #${prNumber}: ${reviewers.join(', ')}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.warn(`Failed to request reviewers: ${err.message}`);
    return false;
  }
}

/**
 * Verify GitHub token is valid and has required permissions
 */
export async function verifyToken(logger: Logger): Promise<boolean> {
  try {
    const octokit = getOctokit();
    const { data: user } = await octokit.users.getAuthenticated();
    logger.info(`Authenticated as GitHub user: ${user.login}`);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error(`GitHub authentication failed: ${err.message}`);
    return false;
  }
}
