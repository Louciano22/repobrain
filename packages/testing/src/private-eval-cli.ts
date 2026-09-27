import { runPrivateEvaluation } from "./private-eval.js";

try {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== "--repos-root" || args[2] !== "--corpus" || args[4] !== "--allow-private-eval") {
    throw new Error("Invalid arguments.");
  }
  const report = runPrivateEvaluation({ reposRoot: args[1]!, corpusFile: args[3]!, allowPrivateEval: true });
  process.stdout.write(`${JSON.stringify(report)}\n`);
} catch {
  process.stderr.write("Private evaluation could not run. Check the local input boundary and format.\n");
  process.exitCode = 1;
}
