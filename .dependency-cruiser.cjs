/**
 * dependency-cruiser — enforce the package dependency direction (engineering-handbook §3.1).
 *
 *   apps/web ────┬──▶ packages/ui ──▶ packages/shared ◀── packages/db
 *   apps/api ────┤                                          ▲
 *   apps/worker ─┴──▶ packages/providers ───────────────────┘
 *
 * Rules: no cycles · shared imports nothing internal · packages never import
 * apps · apps never import each other. Vendor-SDK containment is enforced by
 * Biome `noRestrictedImports`; the corresponding depcruise rule is a backstop.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies make the graph impossible to reason about.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-leaf',
      comment: 'packages/shared depends on nothing internal (handbook §3.1).',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^(packages/(db|ui|providers)|apps)/' },
    },
    {
      name: 'ui-is-presentational',
      comment: 'packages/ui may import shared only — no db/providers/apps.',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: '^(packages/(db|providers)|apps)/' },
    },
    {
      name: 'packages-never-import-apps',
      comment: 'Packages are shared libraries; apps consume them, never the reverse.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-are-isolated',
      comment: 'Apps never import each other; share via packages/ (handbook §3.1).',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'vendor-sdks-only-in-providers',
      comment: 'Vendor SDKs live only in packages/providers (handbook §3.1).',
      severity: 'error',
      from: { pathNot: '^packages/providers/' },
      to: {
        dependencyTypes: ['npm'],
        path: '^node_modules/(openai|@anthropic-ai/sdk|elevenlabs|replicate|@fal-ai/client|@google/generative-ai|stripe|@aws-sdk/client-s3)(/|$)',
      },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|/dist/|\\.next/)' },
  },
};
