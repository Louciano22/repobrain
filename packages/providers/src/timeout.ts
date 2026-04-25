import { RuntimeBoundaryError } from "@repobrain/core";

export async function withProviderTimeout<T>(
  operation: Promise<T>,
  params: { providerId: string; timeoutMs?: number }
): Promise<T> {
  const timeoutMs = params.timeoutMs ?? 10_000;
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new RuntimeBoundaryError("RATE_LIMITED", `Provider ${params.providerId} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
