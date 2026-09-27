import type { RuntimeBoundaryCode, SafeRuntimeError } from "@repobrain/shared-types";

export class RuntimeBoundaryError extends Error {
  readonly code: RuntimeBoundaryCode;

  constructor(code: RuntimeBoundaryCode, message: string) {
    super(message);
    this.name = "RuntimeBoundaryError";
    this.code = code;
  }

  toSafeError(): SafeRuntimeError {
    return {
      code: this.code,
      message: this.message
    };
  }
}

export function toSafeRuntimeError(error: unknown): SafeRuntimeError {
  if (error instanceof RuntimeBoundaryError) {
    return error.toSafeError();
  }

  return {
    code: "UNKNOWN_RUNTIME_ERROR",
    message: "Cream Soda runtime boundary failed safely."
  };
}
