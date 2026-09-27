# Cream Soda brand migration

RepoBrain is now **Cream Soda**, repository intelligence by LouChi AI.

This release changes the customer-facing product name while preserving compatibility:

- `repobrain` remains a supported CLI alias; `creamsoda` is the new preferred command.
- `@repobrain/*` workspace package names remain unchanged for now.
- `.repobrain/` remains the project-local data directory.
- `REPOBRAIN_*` environment variables remain supported.
- Existing MCP tool names and response envelopes remain stable.

These legacy identifiers will not be removed without a documented migration path and a deprecation period. Product documentation and UI should use **Cream Soda** going forward.

Product home: <https://UseCreamSoda.com>
