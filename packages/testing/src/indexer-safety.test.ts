import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { indexCodebase } from "@repobrain/indexer";
import { initializeProject } from "@repobrain/storage";

function fixture(run: (root: string, outside: string) => void): void {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "cream-soda-index-safety-"));
  const root = path.join(base, "repo");
  const outside = path.join(base, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  try { run(root, outside); } finally { fs.rmSync(base, { recursive: true, force: true }); }
}

fixture((root, outside) => {
  const secret = "DO_NOT_PERSIST_SECRET_987654321";
  fs.writeFileSync(path.join(root, "safe.ts"), "export const safe = 1;\n");
  for (const name of ["credentials.json", "secrets.json", "root.pem", "root.key", ".env.local"]) {
    fs.writeFileSync(path.join(root, name), secret);
  }
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "nested", "credentials.json"), secret);
  fs.writeFileSync(path.join(root, "nested", ".env"), secret);
  const initialized = initializeProject(root);
  const config = JSON.parse(fs.readFileSync(initialized.configPath, "utf8"));
  config.ignorePatterns = [];
  config.sensitivePathPatterns = [];
  fs.writeFileSync(initialized.configPath, JSON.stringify(config));
  const result = indexCodebase(root);
  assert.equal(result.filesIndexed, 1);
  assert.ok(result.skippedPaths.some((entry) => entry.path === "credentials.json" && entry.reason === "sensitive"));
  const persisted = fs.readFileSync(initialized.storePath, "utf8");
  assert.equal(persisted.includes(secret), false);
  assert.equal(JSON.parse(persisted).tables.repo_files[0].path, "safe.ts");

  fs.writeFileSync(path.join(outside, "other.ts"), secret);
  fs.symlinkSync(outside, path.join(root, "linked"));
  assert.equal(indexCodebase(root).filesIndexed, 1);
  assert.ok(indexCodebase(root).skippedPaths.some((entry) => entry.path === "linked" && entry.reason === "symlink"));

  const before = fs.readFileSync(initialized.storePath, "utf8");
  fs.writeFileSync(path.join(root, "large.ts"), "x".repeat(2 * 1024 * 1024 + 1));
  assert.throws(() => indexCodebase(root), /safe file boundary/);
  assert.equal(fs.readFileSync(initialized.storePath, "utf8"), before);
  fs.rmSync(path.join(root, "large.ts"));
  fs.symlinkSync(path.join(outside, "other.ts"), path.join(root, ".gitignore"));
  assert.throws(() => indexCodebase(root));
  assert.equal(fs.readFileSync(initialized.storePath, "utf8"), before);
  fs.rmSync(path.join(root, ".gitignore"));
  fs.writeFileSync(path.join(root, ".gitignore"), "a".repeat(128 * 1024 + 1));
  assert.throws(() => indexCodebase(root), /safe file boundary/);
  assert.equal(fs.readFileSync(initialized.storePath, "utf8"), before);
});

fixture((root, outside) => {
  fs.writeFileSync(path.join(root, "safe.ts"), "export const safe = true;\n");
  fs.symlinkSync(root, path.join(outside, "alias"));
  assert.throws(() => indexCodebase(path.join(outside, "alias")), /real directory/);
  assert.equal(fs.existsSync(path.join(root, ".repobrain")), false);
  fs.symlinkSync(outside, path.join(root, ".repobrain"));
  assert.throws(() => indexCodebase(root), /project directory is unsafe/);
  assert.equal(fs.existsSync(path.join(outside, "store.json")), false);
});

console.log("Cream Soda indexer safety tests passed");
