import { RuntimeBoundaryError } from "@repobrain/core";
import type { ProviderConfigRecord, SafeProviderConfig } from "@repobrain/shared-types";

export type ResolvedProviderSecret =
  | {
      providerId: string;
      required: false;
      value: null;
    }
  | {
      providerId: string;
      required: true;
      value: string;
    };

export function loadProviderSecret(
  provider: ProviderConfigRecord,
  env: NodeJS.ProcessEnv = process.env
): ResolvedProviderSecret {
  if (!provider.enabled || provider.mode === "local") {
    return {
      providerId: provider.id,
      required: false,
      value: null
    };
  }

  if (!provider.secretEnvVar) {
    throw new RuntimeBoundaryError(
      "PROVIDER_NOT_CONFIGURED",
      `Provider ${provider.id} is remote but has no explicit secret env var.`
    );
  }

  const secret = env[provider.secretEnvVar]?.trim();

  if (!secret) {
    throw new RuntimeBoundaryError(
      "PROVIDER_SECRET_MISSING",
      `Provider ${provider.id} is missing required environment secret.`
    );
  }

  return {
    providerId: provider.id,
    required: true,
    value: secret
  };
}

export function exposeProviderConfigToUi(
  provider: ProviderConfigRecord,
  env: NodeJS.ProcessEnv = process.env
): SafeProviderConfig {
  const hasSecret = provider.mode === "local" || !provider.secretEnvVar ? false : Boolean(env[provider.secretEnvVar]);

  return {
    id: provider.id,
    kind: provider.kind,
    mode: provider.mode,
    displayName: provider.displayName,
    enabled: provider.enabled,
    priority: provider.priority,
    baseUrl: provider.baseUrl,
    model: provider.model,
    hasSecret,
    secretSource: provider.mode === "local" ? "not-required" : hasSecret ? "env" : "missing"
  };
}
