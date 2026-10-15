import type { TaskProvider } from './task-providers'

/**
 * Task providers this corporate fork offers. GitHub only — the fleet's issues live on the
 * company GHES host, and GitLab/Linear/Jira would send task titles and bodies to vendors
 * that are not part of the deployment.
 *
 * Its own module so upstream's suites for the hidden providers can mock it back to all four
 * and keep testing that dormant code.
 */
export const FORK_OFFERED_TASK_PROVIDERS: readonly TaskProvider[] = ['github']
