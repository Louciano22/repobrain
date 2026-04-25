export const corePackage = {
  name: "@repobrain/core",
  layer: "foundation"
} as const;

export * from "./errors.js";
export * from "./filesystem.js";
export * from "./redaction.js";
export * from "./safety.js";
