import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RuntimeBoundaryError } from "@repobrain/core";
import type {
  ProviderConfigRecord,
  RepoBrainLocalConfig,
  SafeProviderConfig,
  SafeRepoBrainConfig
} from "@repobrain/shared-types";

export type ConfigEnvironment = Partial<Pick<NodeJS.ProcessEnv, "REPOBRAIN_CONFIG_PATH" | "REPOBRAIN_HOME">>;

const DEFAULT_CONFIG_FILE = "config.json";

export function resolveRepoBrainHome(env: ConfigEnvironment = process.env): string {
  return path.resolve(env.REPOBRAIN_HOME?.trim() || path.join(os.homedir(), ".repobrain"));
}

export function resolveConfigPath(env: ConfigEnvironment = process.env): string {
  const explicitPath = env.REPOBRAIN_CONFIG_PATH?.trim();
  return path.resolve(explicitPath || path.join(resolveRepoBrainHome(env), DEFAULT_CONFIG_FILE));
}

function parseConfig(raw: string, configPath: string): RepoBrainLocalConfig {
  try {
    return JSON.parse(raw) as RepoBrainLocalConfig;
  } catch {
    throw new RuntimeBoundaryError("CONFIG_INVALID", `RepoBrain config is not valid JSON: ${configPath}`);
  }
}

function validateConfig(config: RepoBrainLocalConfig): RepoBrainLocalConfig {
  if (config.version !== 1 || !Array.isArray(config.allowedRoots)) {
    throw new RuntimeBoundaryError("CONFIG_INVALID", "RepoBrain config must include version 1 and allowedRoots.");
  }

  return {
    ...config,
    allowedRoots: config.allowedRoots.map((root) => path.resolve(root)),
    providers: config.providers ?? []
  };
}

export function loadRepoBrainConfig(params: {
  configPath?: string;
  env?: ConfigEnvironment;
} = {}): RepoBrainLocalConfig {
  const configPath = path.resolve(params.configPath || resolveConfigPath(params.env));

  if (!fs.existsSync(configPath)) {
    throw new RuntimeBoundaryError("CONFIG_NOT_FOUND", `RepoBrain config not found: ${configPath}`);
  }

  return validateConfig(parseConfig(fs.readFileSync(configPath, "utf8"), configPath));
}

export function writeRepoBrainConfig(config: RepoBrainLocalConfig, configPath: string): RepoBrainLocalConfig {
  const validated = validateConfig(config);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(validated, null, 2)}\n`);
  return validated;
}

export function updateProviderConfigs(
  configPath: string,
  providers: ProviderConfigRecord[]
): RepoBrainLocalConfig {
  const config = loadRepoBrainConfig({ configPath });
  return writeRepoBrainConfig({ ...config, providers }, configPath);
}

function providerToSafeConfig(provider: ProviderConfigRecord, env: NodeJS.ProcessEnv): SafeProviderConfig {
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

export function toSafeRepoBrainConfig(
  config: RepoBrainLocalConfig,
  env: NodeJS.ProcessEnv = process.env
): SafeRepoBrainConfig {
  return {
    ...config,
    providers: (config.providers ?? []).map((provider) => providerToSafeConfig(provider, env))
  };
}
