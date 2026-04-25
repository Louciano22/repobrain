import type { ProviderKind, ProviderRegistryEntry } from "@repobrain/shared-types";

export const DEFAULT_PROVIDER_IDS: Record<ProviderKind, string> = {
  embedding: "local-embedding",
  reranker: "local-reranker",
  model: "local-model",
  vector: "local-vector"
};

export const PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  {
    id: "local-embedding",
    kind: "embedding",
    mode: "local",
    displayName: "Local embedding provider",
    description: "Local embedding adapter slot. No cloud calls are made by default.",
    requiresSecret: false
  },
  {
    id: "openai-compatible-embedding",
    kind: "embedding",
    mode: "remote",
    displayName: "OpenAI-compatible embeddings",
    description: "Remote embedding adapter slot for OpenAI-compatible APIs.",
    requiresSecret: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "text-embedding-3-small"
  },
  {
    id: "local-reranker",
    kind: "reranker",
    mode: "local",
    displayName: "Local reranker provider",
    description: "Local reranker adapter slot. No cloud calls are made by default.",
    requiresSecret: false
  },
  {
    id: "remote-reranker",
    kind: "reranker",
    mode: "remote",
    displayName: "Remote reranker provider",
    description: "Remote reranker adapter slot for explicitly configured services.",
    requiresSecret: true
  },
  {
    id: "local-model",
    kind: "model",
    mode: "local",
    displayName: "Local model helper",
    description: "Local LLM helper slot for future summarization or task intent support.",
    requiresSecret: false
  },
  {
    id: "anthropic-compatible-model",
    kind: "model",
    mode: "remote",
    displayName: "Anthropic-compatible model",
    description: "Remote LLM helper adapter slot for Anthropic-compatible APIs.",
    requiresSecret: true
  },
  {
    id: "openai-compatible-model",
    kind: "model",
    mode: "remote",
    displayName: "OpenAI-compatible model",
    description: "Remote LLM helper adapter slot for OpenAI-compatible APIs.",
    requiresSecret: true
  },
  {
    id: "local-vector",
    kind: "vector",
    mode: "local",
    displayName: "Local vector store",
    description: "Local vector database adapter slot.",
    requiresSecret: false
  }
];

export function getProviderRegistryEntry(providerId: string): ProviderRegistryEntry | undefined {
  return PROVIDER_REGISTRY.find((entry) => entry.id === providerId);
}

export function listProviderRegistry(kind?: ProviderKind): ProviderRegistryEntry[] {
  return kind ? PROVIDER_REGISTRY.filter((entry) => entry.kind === kind) : [...PROVIDER_REGISTRY];
}
