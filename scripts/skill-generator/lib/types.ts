/**
 * Type definitions for the skill generator
 */

export type Command = 'generate' | 'review' | 'scenario' | 'list-providers';

/**
 * Test scenario configuration for agent testing
 */
export interface TestScenario {
  events: string[];       // Events to mention in test prompt
  prompt?: string;        // Custom prompt template (optional, uses default if not specified)
  skillName?: string;     // Override skill name (e.g., for hookdeck-event-gateway)
}

/**
 * Output of the scenario command - used by test-agent-scenario.sh
 */
export interface ScenarioConfig {
  provider: string;       // Provider name (e.g., "stripe")
  displayName: string;    // Display name (e.g., "Stripe")
  framework: string;      // Framework (e.g., "express", "nextjs", "fastapi")
  skillName: string;      // Skill directory name (e.g., "stripe-webhooks")
  prompt: string;         // The full prompt to send to the agent
}

/**
 * Provider configuration (from CLI or config file)
 */
export interface ProviderConfig {
  name: string;           // kebab-case name (e.g., "elevenlabs")
  displayName?: string;   // Proper casing (e.g., "ElevenLabs")
  docs?: {
    webhooks?: string;      // Main webhook docs URL
    verification?: string;  // Signature verification docs
    events?: string;        // Event types reference
    api?: string;           // API reference docs
    [key: string]: string | undefined; // Additional doc URLs (e.g., reference_impl)
  };
  notes?: string;         // Hints for the agent
  testScenario?: TestScenario; // Configuration for agent testing
}

/**
 * Base options shared by all commands
 */
export interface BaseOptions {
  parallel: number;
  dryRun: boolean;
  maxIterations: number;
  configFile?: string;
  model: string;
  cliTool: string;
}

/**
 * PR creation mode: false (no PR), true (normal PR), or 'draft' (draft PR)
 */
export type CreatePrOption = boolean | 'draft';

/**
 * Options for the generate command
 */
export interface GenerateOptions extends BaseOptions {
  command: 'generate';
  baseBranch: string;
  skipTests: boolean;
  skipReview: boolean;
  createPr: CreatePrOption;
}

/**
 * Options for the review command
 */
export interface ReviewOptions extends BaseOptions {
  command: 'review';
  createPr: CreatePrOption;
  branchPrefix: string;
}

export type Options = GenerateOptions | ReviewOptions;

/**
 * Result of a phase (generation, testing, review)
 */
export interface PhaseResult {
  passed: boolean;
  details?: string;
}

/**
 * Result of the entire operation for a provider
 */
export interface OperationResult {
  provider: string;
  command: Command;
  success: boolean;
  branch?: string;
  prUrl?: string;
  phases: {
    generation?: PhaseResult;
    testing: PhaseResult;
    review: PhaseResult;
    iterations: number;
  };
  issuesFound: number;
  issuesFixed: number;
  error?: string;
  duration: number;
  logFile: string;
}

/**
 * Severity levels for review issues
 */
export type IssueSeverity = 'critical' | 'major' | 'minor';

/**
 * Categories for review issues
 */
export type IssueCategory = 'verification' | 'events' | 'documentation' | 'code' | 'consistency';

/**
 * A single issue found during review
 */
export interface ReviewIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  file: string;
  description: string;
  suggestedFix?: string;
}

/**
 * Result of a review session
 */
export interface ReviewResult {
  approved: boolean;
  issues: ReviewIssue[];
  suggestions: string[];
}

/**
 * Test result for a single framework
 */
export interface TestResult {
  framework: 'express' | 'nextjs' | 'fastapi';
  passed: boolean;
  output: string;
  error?: string;
}

/**
 * Combined test results
 */
export interface TestResults {
  passed: boolean;
  frameworks: TestResult[];
}

/**
 * Logger interface for consistent output
 */
export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}
