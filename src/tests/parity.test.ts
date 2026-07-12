import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const baselineDir = path.join(root, "openspec", "changes", "rewrite-parser-to-typescript", "artifacts", "baseline");

function listFiles(relativeRoot: string): string[] {
  const absoluteRoot = path.join(root, relativeRoot);
  const output: string[] = [];

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        output.push(path.relative(absoluteRoot, fullPath).split(path.sep).join("/"));
      }
    }
  }

  walk(absoluteRoot);
  output.sort();
  return output;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

test("baseline manifests exist", () => {
  assert.equal(fs.existsSync(path.join(baselineDir, "comprehensive-rules-files.txt")), true);
  assert.equal(fs.existsSync(path.join(baselineDir, "rules-site-files.txt")), true);
  assert.equal(fs.existsSync(path.join(baselineDir, "rules-site-data-hashes.json")), true);
  assert.equal(fs.existsSync(path.join(baselineDir, "python-profile.txt")), true);
});

test("generated output roots exist", () => {
  assert.equal(fs.existsSync(path.join(root, "comprehensive-rules")), true);
  assert.equal(fs.existsSync(path.join(root, ".build", "generated")), true);
  assert.equal(fs.existsSync(path.join(root, ".build", "generated", "data", "navigation.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".build", "generated", "data", "search-index.json")), true);
  assert.equal(fs.existsSync(path.join(root, ".build", "generated", "data", "tooltip-previews.json")), true);
});

test("structural parity matches baseline manifests", () => {
  const baselineComprehensive = fs
    .readFileSync(path.join(baselineDir, "comprehensive-rules-files.txt"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(path.sep).join("/"))
    .sort();

  const baselineRulesSite = fs
    .readFileSync(path.join(baselineDir, "rules-site-files.txt"), "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(path.sep).join("/"))
    .sort();

  assert.deepEqual(listFiles("comprehensive-rules"), baselineComprehensive);
  assert.deepEqual(listFiles(".build/generated"), baselineRulesSite);
});

test("bundle contract fields exist with expected types", () => {
  const navigation = readJson<Record<string, unknown>>(path.join(root, ".build", "generated", "data", "navigation.json"));
  assert.equal(typeof navigation.generatedFrom, "string");
  assert.equal(typeof navigation.effectiveDate, "string");
  assert.equal(typeof navigation.defaultRoute, "string");
  assert.equal(Array.isArray(navigation.rules), true);
  assert.equal(Array.isArray(navigation.glossary), true);

  const search = readJson<Record<string, unknown>>(path.join(root, ".build", "generated", "data", "search-index.json"));
  assert.equal(typeof search.documents, "object");
  const docs = search.documents as Record<string, unknown>;
  assert.equal(Array.isArray(docs.rules), true);
  assert.equal(Array.isArray(docs.glossary), true);

  const previews = readJson<Record<string, unknown>>(path.join(root, ".build", "generated", "data", "tooltip-previews.json"));
  assert.equal(typeof previews.rules, "object");
  assert.equal(typeof previews.glossary, "object");
});

test("semantic sample checks routes and anchors", () => {
  const navigation = readJson<{ rules: Array<{ sections: Array<{ route: string; pageId: string }> }> }>(
    path.join(root, ".build", "generated", "data", "navigation.json"),
  );

  const firstSection = navigation.rules.flatMap((chapter) => chapter.sections)[0];
  assert.ok(firstSection);
  assert.equal(firstSection.route.startsWith("#rules/"), true);
  assert.equal(firstSection.pageId.startsWith("rules/"), true);

  const firstRulePageId = firstSection.pageId.replace("rules/", "");
  const content = readJson<{ rules: Array<{ anchor: string; route: string }> }>(
    path.join(root, ".build", "generated", "data", "content", "rules", `${firstRulePageId}.json`),
  );

  assert.ok(content.rules.length > 0);
  const firstRule = content.rules[0];
  assert.equal(firstRule.anchor.startsWith("rule-"), true);
  assert.equal(firstRule.route.includes(firstRule.anchor), true);
});
