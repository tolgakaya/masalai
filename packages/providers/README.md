# @masalai/providers

Adapter interfaces for external vendors: `TextProvider`, `ImageProvider`,
`TTSProvider`, `ModerationProvider`. **Vendor SDKs live ONLY here** — Biome
`noRestrictedImports` + a dependency-cruiser rule block them in any other
package/app (engineering-handbook §3.1).

S0 ships the adapter *shapes* only. Concrete vendor implementations (under
`src/<vendor>/`) and the full method contracts land with the pipeline stages in
Stream A (issue #2). Style presets (`styles/*.json`) are versioned data reviewed
like code (they change COGS and output quality).
