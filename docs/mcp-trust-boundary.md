# MCP trust boundary (first hardening slice)

In stdio mode, the host must launch Cream Soda with its working directory set to the one repository it authorizes. The server canonicalizes that root on startup, rejects selection of a different `repo` argument, and forces tool calls to the launch root. This argument-level pin is not a filesystem sandbox. `clear_index` is not advertised or callable through stdio; operators can still use the explicit local runner. Stdio stdout is reserved for JSON-RPC protocol messages.

This is a first boundary, **not a complete sandbox**. The direct local `--tool` runner remains an operator-facing path. Project-store symlink/write containment, file discovery/read containment, symlink races, sensitive-path coverage, resource budgets, stored traces, and secret redaction still require further hardening before untrusted repositories or autonomous agents should be considered safe. The current `.gitignore` handling is a subset, not an exact Git implementation. Do not grant the MCP process access to unrelated private files or provider keys while those controls are incomplete.

Regression coverage: `packages/testing/src/stdio.test.ts` performs a real initialize/list/call exchange, indexes the launch root with the `repo` argument omitted, rejects an outside repository, denies `clear_index`, and checks that stdout contains protocol JSON only.
