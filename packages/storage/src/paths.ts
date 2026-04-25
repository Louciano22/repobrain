import path from "node:path";

export const PROJECT_DIR_NAME = ".repobrain";

export type ProjectPaths = {
  repoRoot: string;
  projectDir: string;
  configPath: string;
  storePath: string;
  schemaPath: string;
  tracesDir: string;
};

export function resolveProjectPaths(repoRoot: string): ProjectPaths {
  const resolvedRoot = path.resolve(repoRoot);
  const projectDir = path.join(resolvedRoot, PROJECT_DIR_NAME);

  return {
    repoRoot: resolvedRoot,
    projectDir,
    configPath: path.join(projectDir, "config.json"),
    storePath: path.join(projectDir, "store.json"),
    schemaPath: path.join(projectDir, "schema.json"),
    tracesDir: path.join(projectDir, "traces")
  };
}
