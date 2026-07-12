import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { parseRules } from "../parser/core.js";

const reportPath = path.join(process.cwd(), "openspec", "changes", "rewrite-parser-to-typescript", "artifacts", "benchmark-report.md");

function runPythonBaseline(): number {
  const start = performance.now();
  const result = spawnSync("python", ["./parse_comprehensive_rules.py"], { stdio: "inherit", shell: true });
  const end = performance.now();
  if (result.status !== 0) {
    throw new Error("Python baseline run failed.");
  }
  return end - start;
}

async function runTypeScript(): Promise<number> {
  const start = performance.now();
  await parseRules();
  const end = performance.now();
  return end - start;
}

async function main(): Promise<void> {
  const pythonMs = runPythonBaseline();
  const tsMs = await runTypeScript();
  const improvement = ((pythonMs - tsMs) / pythonMs) * 100;

  const lines = [
    "# Benchmark Report",
    "",
    `- Python runtime (ms): ${pythonMs.toFixed(2)}`,
    `- TypeScript runtime (ms): ${tsMs.toFixed(2)}`,
    `- Improvement (%): ${improvement.toFixed(2)}`,
    "",
    improvement >= 0 ? "TypeScript runtime meets or improves baseline." : "TypeScript runtime is slower than baseline.",
  ];

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log(lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
