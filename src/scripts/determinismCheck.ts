import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseRules, parserPaths } from "../parser/core.js";

function fileHashes(rootPath: string): Map<string, string> {
  const hashes = new Map<string, string>();

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = path.relative(rootPath, fullPath).split(path.sep).join("/");
        const digest = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
        hashes.set(rel, digest);
      }
    }
  }

  walk(rootPath);
  return hashes;
}

function compareMaps(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left.entries()) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
}

async function main(): Promise<void> {
  await parseRules();
  const firstRulesSite = fileHashes(parserPaths.siteOutputPath);
  const firstRulesMarkdown = fileHashes(parserPaths.markdownOutputPath);

  await parseRules();
  const secondRulesSite = fileHashes(parserPaths.siteOutputPath);
  const secondRulesMarkdown = fileHashes(parserPaths.markdownOutputPath);

  if (!compareMaps(firstRulesSite, secondRulesSite) || !compareMaps(firstRulesMarkdown, secondRulesMarkdown)) {
    throw new Error("Determinism check failed: output hashes changed between identical runs.");
  }

  console.log("Determinism check passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
