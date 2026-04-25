import type {
  ProviderConfigRecord,
  ProviderKind,
  ProviderResolution,
  RepoBrainLocalConfig
} from "@repobrain/shared-types";
import { exposeProviderConfigToUi } from "./secrets.js";
import { DEFAULT_PROVIDER_IDS, getProviderRegistryEntry } from "./registry.js";

function byPriority(left: ProviderConfigRecord, right: ProviderConfigRecord): number {
  return left.priority - right.priority;
}

export function resolveProvider(params: {
  config: RepoBrainLocalConfig;
  kind: ProviderKind;
  env?: NodeJS.ProcessEnv;
}): ProviderResolution {
  const providers = (params.config.providers ?? [])
    .filter((provider) => provider.kind === params.kind && provider.enabled)
    .sort(byPriority);
  const selected = providers[0];
  const defaultProviderId = DEFAULT_PROVIDER_IDS[params.kind];

  if (!selected) {
    return {
      status: "missing",
      kind: params.kind,
      defaultProviderId,
      reason: `No enabled ${params.kind} provider is configured.`
    };
  }

  const registry = getProviderRegistryEntry(selected.id);

  if (!registry) {
    return {
      status: "invalid",
      kind: params.kind,
      providerId: selected.id,
      reason: `Provider ${selected.id} is not registered.`
    };
  }

  if (registry.kind !== selected.kind || registry.mode !== selected.mode) {
    return {
      status: "invalid",
      kind: params.kind,
      providerId: selected.id,
      reason: `Provider ${selected.id} does not match its registry kind or mode.`
    };
  }

  const safeProvider = exposeProviderConfigToUi(selected, params.env);

  if (registry.requiresSecret && safeProvider.secretSource === "missing") {
    return {
      status: "missing",
      kind: params.kind,
      defaultProviderId,
      reason: `Provider ${selected.id} is enabled but its secret is missing.`
    };
  }

  return {
    status: "configured",
    kind: params.kind,
    provider: safeProvider,
    registry,
    activeProviderId: selected.id
  };
}

export function resolveAllProviders(
  config: RepoBrainLocalConfig,
  env: NodeJS.ProcessEnv = process.env
): Record<ProviderKind, ProviderResolution> {
  return {
    embedding: resolveProvider({ config, kind: "embedding", env }),
    reranker: resolveProvider({ config, kind: "reranker", env }),
    model: resolveProvider({ config, kind: "model", env }),
    vector: resolveProvider({ config, kind: "vector", env })
  };
}
