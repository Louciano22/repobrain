export const configPackage = {
  name: "@repobrain/config",
  layer: "foundation"
} as const;

export * from "./local-config.js";
export * from "./project-config.js";
