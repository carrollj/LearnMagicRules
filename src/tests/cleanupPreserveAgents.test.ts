import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanOutputDirectory } from "../parser/core.js";

function withTempDir(run: (tempDir: string) => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-preserve-agents-"));
  try {
    run(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("cleanOutputDirectory preserves AGENTS.md while removing stale files", () => {
  withTempDir((tempDir) => {
    const outputRoot = path.join(tempDir, "output");
    fs.mkdirSync(outputRoot, { recursive: true });

    const agentsPath = path.join(outputRoot, "AGENTS.md");
    const stalePath = path.join(outputRoot, "stale.json");
    fs.writeFileSync(agentsPath, "instructions", "utf-8");
    fs.writeFileSync(stalePath, "stale", "utf-8");

    cleanOutputDirectory(outputRoot);

    assert.equal(fs.existsSync(agentsPath), true);
    assert.equal(fs.existsSync(stalePath), false);
  });
});

test("cleanOutputDirectory preserves nested AGENTS.md files", () => {
  withTempDir((tempDir) => {
    const outputRoot = path.join(tempDir, "output");
    const nestedDir = path.join(outputRoot, "nested", "deep");
    fs.mkdirSync(nestedDir, { recursive: true });

    const nestedAgents = path.join(nestedDir, "AGENTS.md");
    const nestedStale = path.join(nestedDir, "generated.tmp");
    fs.writeFileSync(nestedAgents, "nested instructions", "utf-8");
    fs.writeFileSync(nestedStale, "remove me", "utf-8");

    cleanOutputDirectory(outputRoot);

    assert.equal(fs.existsSync(nestedAgents), true);
    assert.equal(fs.existsSync(nestedStale), false);
  });
});

test("cleanOutputDirectory creates missing output directory", () => {
  withTempDir((tempDir) => {
    const outputRoot = path.join(tempDir, "missing-output");
    assert.equal(fs.existsSync(outputRoot), false);

    cleanOutputDirectory(outputRoot);

    assert.equal(fs.existsSync(outputRoot), true);
    assert.equal(fs.statSync(outputRoot).isDirectory(), true);
  });
});
