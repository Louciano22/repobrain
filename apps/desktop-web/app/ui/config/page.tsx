import { loadRepoBrainConfig, toSafeRepoBrainConfig } from "@repobrain/config";
import { DEFAULT_PROVIDER_IDS, listProviderRegistry, resolveAllProviders } from "@repobrain/providers";
import { ShellPanel, ShellState } from "@repobrain/ui";
import { resolveProjectPaths } from "@repobrain/storage";
import { AppShell } from "../../shell";

export const dynamic = "force-dynamic";

export default function ConfigPage() {
  const repoRoot = process.env.REPOBRAIN_PROJECT_ROOT ?? process.cwd();
  const projectPaths = resolveProjectPaths(repoRoot);

  try {
    const config = loadRepoBrainConfig({ configPath: projectPaths.configPath });
    const safeConfig = toSafeRepoBrainConfig(config);
    const resolutions = resolveAllProviders(config);

    return (
      <AppShell title="Config" subtitle="Local runtime, provider, token budget, and retrieval-depth config shell.">
        <section className="shell-grid">
          {Object.values(resolutions).map((resolution) => (
            <ShellState
              key={resolution.kind}
              state={resolution.status === "configured" ? "success" : resolution.status === "missing" ? "empty" : "error"}
              title={`${resolution.kind} provider`}
              detail={
                resolution.status === "configured"
                  ? resolution.activeProviderId
                  : resolution.status === "missing"
                    ? resolution.reason
                    : resolution.reason
              }
            />
          ))}
        </section>

        <ShellPanel title="Configured providers">
          {safeConfig.providers.length === 0 ? (
            <p>No providers are configured. Defaults are explicit and disabled until local config opts in.</p>
          ) : (
            <div className="config-list">
              {safeConfig.providers.map((provider) => (
                <div className="config-row" key={`${provider.kind}-${provider.id}`}>
                  <strong>{provider.displayName}</strong>
                  <span>
                    {provider.kind} · {provider.mode} · {provider.enabled ? "enabled" : "disabled"} · {provider.secretSource}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ShellPanel>

        <ShellPanel title="Configure from CLI">
          <pre>{`pnpm --filter @repobrain/cli exec node dist/index.js config set-provider embedding local-embedding ${repoRoot}`}</pre>
          <p>Remote providers must name a secret environment variable; raw secret values stay outside the UI.</p>
        </ShellPanel>

        <ShellPanel title="Provider registry">
          <div className="config-list">
            {listProviderRegistry().map((entry) => (
              <div className="config-row" key={entry.id}>
                <strong>
                  {entry.displayName}
                  {DEFAULT_PROVIDER_IDS[entry.kind] === entry.id ? " (default)" : ""}
                </strong>
                <span>
                  {entry.kind} · {entry.mode} · {entry.requiresSecret ? "secret required" : "no secret required"}
                </span>
              </div>
            ))}
          </div>
        </ShellPanel>
      </AppShell>
    );
  } catch {
    return (
      <AppShell title="Config" subtitle="Local runtime, provider, token budget, and retrieval-depth config shell.">
        <ShellState state="empty" title="No local config" detail={`Run repobrain init for ${repoRoot}.`} />
        <ShellPanel title="Provider defaults">
          <p>Provider defaults are explicit but inactive until a project-local config exists.</p>
        </ShellPanel>
      </AppShell>
    );
  }
}
