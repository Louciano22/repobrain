export type EmbeddingProviderAdapter = {
  id: string;
  embed(input: string[]): Promise<number[][]>;
};

export type RerankerProviderAdapter = {
  id: string;
  rerank<T extends { id: string; text: string }>(query: string, candidates: T[]): Promise<T[]>;
};

export type LlmHelperProviderAdapter = {
  id: string;
  complete(prompt: string): Promise<string>;
};
