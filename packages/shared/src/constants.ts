/**
 * Cross-boundary constants shared by api ⇄ worker (the async spine).
 *
 * Queue names follow the dot-namespaced convention `{domain}.{stage}`
 * (engineering-handbook §6.5). The real pipeline queues
 * (`story.plan|illustrate|narrate|assemble`) land with their stages; the
 * walking-skeleton health check (m0-kickoff §7) uses `health.job`.
 */
export const HEALTH_JOB_QUEUE = 'health.job' as const;

/**
 * Payload schema version. Payloads carry a `v` field so a worker can accept the
 * current and previous version for one release cycle, keeping in-flight jobs
 * alive across deploys (engineering-handbook §5.6).
 */
export const HEALTH_JOB_PAYLOAD_VERSION = 1 as const;
