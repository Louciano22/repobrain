import { RuntimeBoundaryError } from "./errors.js";

export type SafetyWindow = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

const memoryWindows = new Map<string, { count: number; resetAt: number }>();

export function assertWithinSafetyWindow(window: SafetyWindow): void {
  const now = window.nowMs ?? Date.now();
  const current = memoryWindows.get(window.key);

  if (!current || current.resetAt <= now) {
    memoryWindows.set(window.key, { count: 1, resetAt: now + window.windowMs });
    return;
  }

  if (current.count >= window.limit) {
    throw new RuntimeBoundaryError("RATE_LIMITED", "RepoBrain safety guard rate limit reached.");
  }

  current.count += 1;
}

export function resetSafetyWindows(): void {
  memoryWindows.clear();
}
