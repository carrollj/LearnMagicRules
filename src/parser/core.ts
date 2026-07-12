import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Chapter, GlossaryEntry, GlossaryVariant, LinkSpan, RuleEntry, Section, SourceDocument } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_DIRECTORY = path.join(ROOT, "source");
const SOURCE_PATH = path.join(SOURCE_DIRECTORY, "MagicCompRules-current.txt");
const SOURCE_METADATA_PATH = path.join(SOURCE_DIRECTORY, "MagicCompRules-current.json");
const MARKDOWN_OUTPUT_PATH = path.join(ROOT, "comprehensive-rules");
const SITE_OUTPUT_PATH = path.join(ROOT, ".build", "generated");
const SITE_DATA_PATH = path.join(SITE_OUTPUT_PATH, "data");
const SITE_CONTENT_PATH = path.join(SITE_DATA_PATH, "content");
const RULES_PAGE_URL = "https://magic.wizards.com/en/rules";
const USER_AGENT = "LearnMagicRulesParserTS/1.0";
// Preserve agent instruction files when cleaning generated outputs.
const PRESERVED_OUTPUT_FILE_BASENAMES = new Set(["AGENTS.md"]);

const MAJOR_HEADER_RE = /^(\d)\. (.+)$/;
const SECTION_HEADER_RE = /^(\d{3})\. (.+)$/;
const RULE_LINE_RE = /^(\d{3}(?:\.\d+)?[a-z]?)(?=\.?\s|$)/;
const RULE_NUMBER_RE = /\d{3}(?:\.\d+)?[a-z]?/g;
const RULE_REFERENCE_SEQUENCE_RE = /\brules?\s+(\d{3}(?:\.\d+)?[a-z]?(?:\s*,\s*\d{3}(?:\.\d+)?[a-z]?)*(?:\s*,?\s*(?:and|or)\s*\d{3}(?:\.\d+)?[a-z]?)?)\b/gi;
const SECTION_REFERENCE_RE = /\bsection (\d)\b/gi;
const TXT_LINK_RE = /https:\/\/media\.wizards\.com\/\d{4}\/downloads\/MagicCompRules\s+\d+\.txt/;
const EFFECTIVE_DATE_RE = /These rules are effective as of (.+?)\./;
const GLOSSARY_TERM_REFERENCE_RE = /\bSee(?: also)? ([A-Z][A-Za-z0-9'’/,+\- ]*(?: \([^)]+\))?)\./g;
const PARENTHETICAL_SUFFIX_RE = /\s*\([^)]+\)$/;

function chapterDirectoryName(chapter: Chapter): string {
  return `${chapter.number}-${slugify(chapter.title)}`;
}

function sectionFileName(section: Section): string {
  return `${section.number}-${slugify(section.title)}.md`;
}

function sectionFilePath(section: Section): string {
  return path.join(MARKDOWN_OUTPUT_PATH, chapterDirectoryName({ number: section.chapterNumber, title: section.chapterTitle }), sectionFileName(section));
}

function sectionPageSlug(section: Section): string {
  return `${section.number}-${slugify(section.title)}`;
}

function sectionPageId(section: Section): string {
  return `rules/${sectionPageSlug(section)}`;
}

function sectionRoute(section: Section): string {
  return routeForPage(sectionPageId(section));
}

function glossaryGroupKey(entry: GlossaryEntry): string {
  const firstCharacter = entry.term[0]?.toLowerCase() ?? "other";
  if (firstCharacter >= "a" && firstCharacter <= "z") {
    return firstCharacter;
  }
  return "other";
}

function glossaryFilePath(entry: GlossaryEntry): string {
  return path.join(MARKDOWN_OUTPUT_PATH, "glossary", glossaryGroupKey(entry), `${slugify(entry.term)}.md`);
}

function glossaryPageSlug(entry: GlossaryEntry): string {
  return slugify(entry.term);
}

function glossaryPageId(entry: GlossaryEntry): string {
  return `glossary/${glossaryPageSlug(entry)}`;
}

function glossaryRoute(entry: GlossaryEntry): string {
  return routeForPage(glossaryPageId(entry));
}

async function httpRequest(url: string, method: string = "GET"): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: {
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response;
}

function normalizeUrl(url: string): string {
  return encodeURI(url);
}

async function discoverRulesTxtUrl(): Promise<string> {
  const response = await httpRequest(RULES_PAGE_URL);
  const pageHtml = await response.text();
  const unescaped = pageHtml
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");

  const match = unescaped.match(TXT_LINK_RE);
  if (!match) {
    throw new Error("Could not find the current Comprehensive Rules TXT link on the official rules page.");
  }
  return normalizeUrl(match[0]);
}

async function fetchRemoteMetadata(url: string): Promise<Record<string, string>> {
  const response = await httpRequest(url, "HEAD");
  return {
    url,
    etag: response.headers.get("ETag") ?? "",
    last_modified: response.headers.get("Last-Modified") ?? "",
    content_length: response.headers.get("Content-Length") ?? "",
  };
}

function loadLocalMetadata(): Record<string, string> {
  if (!fs.existsSync(SOURCE_METADATA_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(SOURCE_METADATA_PATH, "utf-8")) as Record<string, string>;
}

function isRemoteNewer(localMetadata: Record<string, string>, remoteMetadata: Record<string, string>): boolean {
  if (!fs.existsSync(SOURCE_PATH)) {
    return true;
  }
  if (localMetadata.url !== remoteMetadata.url) {
    return true;
  }
  if (remoteMetadata.etag && localMetadata.etag !== remoteMetadata.etag) {
    return true;
  }
  if (remoteMetadata.last_modified && localMetadata.last_modified !== remoteMetadata.last_modified) {
    return true;
  }
  if (remoteMetadata.content_length && localMetadata.content_length !== remoteMetadata.content_length) {
    return true;
  }
  return false;
}

async function downloadRulesFile(url: string): Promise<void> {
  fs.mkdirSync(SOURCE_DIRECTORY, { recursive: true });
  const response = await httpRequest(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(SOURCE_PATH, bytes);
}

function extractEffectiveDate(lines: string[]): string {
  for (const line of lines.slice(0, 20)) {
    const match = line.match(EFFECTIVE_DATE_RE);
    if (match) {
      return match[1];
    }
  }
  throw new Error("Could not find the rules effective date in the source document.");
}

export async function ensureLatestRulesDownloaded(): Promise<SourceDocument> {
  const rulesUrl = await discoverRulesTxtUrl();
  const remoteMetadata = await fetchRemoteMetadata(rulesUrl);
  const localMetadata = loadLocalMetadata();

  if (isRemoteNewer(localMetadata, remoteMetadata)) {
    await downloadRulesFile(rulesUrl);
    fs.writeFileSync(SOURCE_METADATA_PATH, JSON.stringify(remoteMetadata, null, 2), "utf-8");
  }

  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`Source rules file not found after download check: ${SOURCE_PATH}`);
  }

  const lines = fs.readFileSync(SOURCE_PATH, "utf-8").split(/\r?\n/);
  return {
    path: SOURCE_PATH,
    effectiveDate: extractEffectiveDate(lines),
  };
}

function normalizeGlossaryKey(term: string): string {
  let normalized = term.replaceAll("’", "'").trim().toLowerCase();
  normalized = normalized.replace(PARENTHETICAL_SUFFIX_RE, "");
  normalized = normalized.replace(/\s+/g, " ");
  return normalized;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function routeForPage(pageId: string, anchor?: string | null): string {
  if (anchor) {
    return `#${pageId}/${anchor}`;
  }
  return `#${pageId}`;
}

function findRulesBodyStart(lines: string[]): number {
  const matches: number[] = [];
  lines.forEach((line, index) => {
    if (line === "1. Game Concepts") {
      matches.push(index);
    }
  });
  if (matches.length < 2) {
    throw new Error("Could not find the start of the rules body.");
  }
  return matches[1];
}

function findRulesBodyEnd(lines: string[], startIndex: number): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (lines[index] === "Glossary") {
      return index;
    }
  }
  return lines.length;
}

function findGlossaryStart(lines: string[]): number {
  const matches: number[] = [];
  lines.forEach((line, index) => {
    if (line === "Glossary") {
      matches.push(index);
    }
  });
  if (matches.length < 2) {
    throw new Error("Could not find the start of the glossary.");
  }
  return matches[1];
}

function anchorForRule(ruleNumber: string): string {
  return `rule-${ruleNumber.replaceAll(".", "-")}`;
}

function relativeLink(fromPath: string, toPath: string, anchor?: string | null): string {
  const relativePath = path.posix.normalize(path.relative(path.dirname(fromPath), toPath).split(path.sep).join("/"));
  if (anchor) {
    return `${relativePath}#${anchor}`;
  }
  return relativePath;
}

function parseSections(lines: string[], startIndex: number, endIndex: number): { chapters: Chapter[]; sections: Section[] } {
  const chapters: Chapter[] = [];
  const sections: Section[] = [];

  let currentChapterNumber: string | null = null;
  let currentChapterTitle: string | null = null;
  let currentSectionNumber: string | null = null;
  let currentSectionTitle: string | null = null;
  let currentSectionLines: string[] = [];

  const flushCurrentSection = (): void => {
    if (!currentChapterNumber || !currentChapterTitle || !currentSectionNumber || !currentSectionTitle) {
      return;
    }
    sections.push({
      chapterNumber: currentChapterNumber,
      chapterTitle: currentChapterTitle,
      number: currentSectionNumber,
      title: currentSectionTitle,
      lines: [...currentSectionLines],
    });
  };

  for (const line of lines.slice(startIndex, endIndex)) {
    const majorMatch = line.match(MAJOR_HEADER_RE);
    const sectionMatch = line.match(SECTION_HEADER_RE);

    if (majorMatch) {
      flushCurrentSection();
      currentChapterNumber = majorMatch[1];
      currentChapterTitle = majorMatch[2];
      chapters.push({ number: currentChapterNumber, title: currentChapterTitle });
      currentSectionNumber = null;
      currentSectionTitle = null;
      currentSectionLines = [];
      continue;
    }

    if (sectionMatch) {
      flushCurrentSection();
      currentSectionNumber = sectionMatch[1];
      currentSectionTitle = sectionMatch[2];
      currentSectionLines = [];
      continue;
    }

    if (currentSectionNumber) {
      currentSectionLines.push(line);
    }
  }

  flushCurrentSection();
  return { chapters, sections };
}

function parseGlossary(lines: string[], glossaryStartIndex: number): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  let currentBlock: string[] = [];

  const flushBlock = (): void => {
    if (currentBlock.length === 0) {
      return;
    }
    const term = currentBlock[0].trim();
    const bodyLines = currentBlock.slice(1).map((line) => line.replace(/\s+$/, ""));
    if (term && bodyLines.length > 0) {
      entries.push({ term, bodyLines });
    }
  };

  for (const line of lines.slice(glossaryStartIndex + 1)) {
    if (line.trim() === "") {
      flushBlock();
      currentBlock = [];
      continue;
    }
    currentBlock.push(line);
  }

  flushBlock();
  return entries;
}

function deriveParentRuleNumber(sectionNumber: string, ruleNumber: string): string | null {
  if (/^\d{3}\.\d+[a-z]$/.test(ruleNumber)) {
    return ruleNumber.replace(/[a-z]$/, "");
  }
  if (/^\d{3}\.\d+$/.test(ruleNumber)) {
    return sectionNumber;
  }
  return null;
}

function parseSectionRules(section: Section): RuleEntry[] {
  const rules: RuleEntry[] = [];
  for (const line of section.lines) {
    const match = line.match(RULE_LINE_RE);
    if (!match) {
      continue;
    }
    const ruleNumber = match[1];
    const afterNumber = line.slice(match[0].length);
    let label = ruleNumber;
    let text = afterNumber.trimStart();
    if (afterNumber.startsWith(".")) {
      label = `${ruleNumber}.`;
      text = afterNumber.slice(1).trimStart();
    }

    rules.push({
      sectionNumber: section.number,
      sectionTitle: section.title,
      number: ruleNumber,
      text,
      label,
      anchor: anchorForRule(ruleNumber),
      parentNumber: deriveParentRuleNumber(section.number, ruleNumber),
    });
  }
  return rules;
}

type RuleLookup = Map<string, { section: Section; anchor: string }>;

function buildRuleLookup(sections: Section[], sectionRules: Map<string, RuleEntry[]>): RuleLookup {
  const lookup: RuleLookup = new Map();
  for (const section of sections) {
    lookup.set(section.number, { section, anchor: anchorForRule(section.number) });
    for (const rule of sectionRules.get(section.number) ?? []) {
      lookup.set(rule.number, { section, anchor: rule.anchor });
    }
  }
  return lookup;
}

function buildRuleChildrenMap(sectionRules: Map<string, RuleEntry[]>): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  for (const rules of sectionRules.values()) {
    for (const rule of rules) {
      if (!rule.parentNumber) {
        continue;
      }
      const existing = childrenMap.get(rule.parentNumber) ?? [];
      existing.push(rule.number);
      childrenMap.set(rule.parentNumber, existing);
    }
  }
  return childrenMap;
}

function buildGlossaryLookup(glossaryEntries: GlossaryEntry[]): Map<string, GlossaryEntry> {
  const glossaryLookup = new Map<string, GlossaryEntry>();

  for (const entry of glossaryEntries) {
    glossaryLookup.set(normalizeGlossaryKey(entry.term), entry);

    const strippedTerm = entry.term.replace(PARENTHETICAL_SUFFIX_RE, "").trim();
    const strippedKey = normalizeGlossaryKey(strippedTerm);
    if (!glossaryLookup.has(strippedKey)) {
      glossaryLookup.set(strippedKey, entry);
    }

    if (entry.term === "Timestamp Order" && !glossaryLookup.has("timestamp")) {
      glossaryLookup.set("timestamp", entry);
    }
  }

  return glossaryLookup;
}

function buildGlossaryAliases(glossaryEntries: GlossaryEntry[]): Map<string, GlossaryEntry> {
  const glossaryAliases = new Map<string, GlossaryEntry>();

  for (const entry of glossaryEntries) {
    const canonicalKey = normalizeGlossaryKey(entry.term);
    const strippedTerm = entry.term.replace(PARENTHETICAL_SUFFIX_RE, "").trim();
    const strippedKey = normalizeGlossaryKey(strippedTerm);

    if (strippedKey && strippedKey !== canonicalKey && !glossaryAliases.has(strippedKey)) {
      glossaryAliases.set(strippedKey, entry);
    }

    if (entry.term === "Timestamp Order" && !glossaryAliases.has("timestamp")) {
      glossaryAliases.set("timestamp", entry);
    }
  }

  return glossaryAliases;
}

function pluralizeWord(word: string): string {
  const lowerWord = word.toLowerCase();
  if (/(s|x|z|ch|sh)$/.test(lowerWord)) {
    return `${word}es`;
  }
  if (lowerWord.endsWith("y") && word.length > 1 && !"aeiou".includes(lowerWord.at(-2) ?? "")) {
    return `${word.slice(0, -1)}ies`;
  }
  return `${word}s`;
}

function generateSimpleVariants(term: string): Set<string> {
  const variants = new Set<string>();
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return variants;
  }

  const lastWord = words[words.length - 1];
  if (!/^[A-Za-z]+$/.test(lastWord)) {
    return variants;
  }

  const plural = pluralizeWord(lastWord);
  if (plural !== lastWord) {
    variants.add([...words.slice(0, -1), plural].join(" "));
  }
  return variants;
}

function compileTermPattern(term: string): RegExp {
  const pieces: string[] = [];
  for (const ch of term) {
    if (ch === "'" || ch === "’") {
      pieces.push("['’]");
    } else if (/\s/.test(ch)) {
      pieces.push("\\s+");
    } else {
      pieces.push(ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    }
  }
  return new RegExp(`(?<![A-Za-z0-9])${pieces.join("")}(?![A-Za-z0-9])`, "gi");
}

function buildGlossaryVariants(glossaryEntries: GlossaryEntry[]): GlossaryVariant[] {
  const variants = new Map<string, GlossaryVariant>();

  for (const entry of glossaryEntries) {
    const canonicalKey = normalizeGlossaryKey(entry.term);
    const strippedTerm = entry.term.replace(PARENTHETICAL_SUFFIX_RE, "").trim();
    const candidateTerms = new Set<string>([entry.term, strippedTerm]);

    for (const candidate of [...candidateTerms]) {
      for (const generated of generateSimpleVariants(candidate)) {
        candidateTerms.add(generated);
      }
    }

    for (const candidate of candidateTerms) {
      const normalizedCandidate = normalizeGlossaryKey(candidate);
      if (!normalizedCandidate) {
        continue;
      }
      const key = `${canonicalKey}::${normalizedCandidate}`;
      if (!variants.has(key)) {
        variants.set(key, {
          canonicalKey,
          entry,
          variantText: candidate,
          pattern: compileTermPattern(candidate),
        });
      }
    }
  }

  return [...variants.values()].sort((a, b) => {
    if (b.variantText.length !== a.variantText.length) {
      return b.variantText.length - a.variantText.length;
    }
    return a.variantText.localeCompare(b.variantText);
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMarkdownRuleReferences(
  text: string,
  currentPath: string,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
): string {
  const linkedRuleText = text.replace(RULE_REFERENCE_SEQUENCE_RE, (fullMatch, sequence: string, offset: number) => {
    const prefixLength = fullMatch.indexOf(sequence);
    const prefix = fullMatch.slice(0, prefixLength);

    let replaced = "";
    let cursor = 0;
    const sequenceMatches = [...sequence.matchAll(/\d{3}(?:\.\d+)?[a-z]?/g)];
    for (const numberMatch of sequenceMatches) {
      if (numberMatch.index === undefined) {
        continue;
      }
      const ruleNumber = numberMatch[0];
      replaced += sequence.slice(cursor, numberMatch.index);
      const target = ruleLookup.get(ruleNumber);
      if (!target) {
        replaced += ruleNumber;
      } else {
        const link = relativeLink(currentPath, sectionFilePath(target.section), target.anchor);
        replaced += `[${ruleNumber}](${link})`;
      }
      cursor = numberMatch.index + ruleNumber.length;
    }
    replaced += sequence.slice(cursor);
    return `${prefix}${replaced}`;
  });

  return linkedRuleText.replace(SECTION_REFERENCE_RE, (fullMatch, chapterNumber: string) => {
    const chapter = chapterLookup.get(chapterNumber);
    if (!chapter) {
      return fullMatch;
    }
    const chapterIndexPath = path.join(MARKDOWN_OUTPUT_PATH, chapterDirectoryName(chapter), "README.md");
    const link = relativeLink(currentPath, chapterIndexPath);
    return `section [${chapterNumber}](${link})`;
  });
}

function buildMarkdownGlossaryReferences(text: string, currentPath: string, glossaryLookup: Map<string, GlossaryEntry>): string {
  return text.replace(GLOSSARY_TERM_REFERENCE_RE, (fullMatch, originalTerm: string) => {
    const glossaryEntry = glossaryLookup.get(normalizeGlossaryKey(originalTerm));
    if (!glossaryEntry) {
      return fullMatch;
    }
    const link = relativeLink(currentPath, glossaryFilePath(glossaryEntry));
    const prefix = fullMatch.slice(0, fullMatch.indexOf(originalTerm));
    return `${prefix}[${originalTerm}](${link}).`;
  });
}

function formatSectionLinesForMarkdown(
  section: Section,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
  glossaryLookup: Map<string, GlossaryEntry>,
): string {
  const formattedLines: string[] = [];
  for (const line of section.lines) {
    let linkedLine = buildMarkdownRuleReferences(line, sectionFilePath(section), ruleLookup, chapterLookup);
    linkedLine = buildMarkdownGlossaryReferences(linkedLine, sectionFilePath(section), glossaryLookup);

    const match = linkedLine.match(RULE_LINE_RE);
    if (match) {
      formattedLines.push(`<a id="${anchorForRule(match[1])}"></a>`);
    }
    formattedLines.push(linkedLine);
  }
  return formattedLines.join("\n").trim();
}

function formatGlossaryLinesForMarkdown(
  entry: GlossaryEntry,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
  glossaryLookup: Map<string, GlossaryEntry>,
): string {
  const formattedLines: string[] = [];
  for (const line of entry.bodyLines) {
    let linkedLine = buildMarkdownRuleReferences(line, glossaryFilePath(entry), ruleLookup, chapterLookup);
    linkedLine = buildMarkdownGlossaryReferences(linkedLine, glossaryFilePath(entry), glossaryLookup);
    formattedLines.push(linkedLine);
  }
  return formattedLines.join("\n").trim();
}

function writeSectionMarkdown(
  section: Section,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
  glossaryLookup: Map<string, GlossaryEntry>,
  effectiveDate: string,
): void {
  fs.mkdirSync(path.dirname(sectionFilePath(section)), { recursive: true });
  const body = formatSectionLinesForMarkdown(section, ruleLookup, chapterLookup, glossaryLookup);
  const markdown = [
    `# ${section.number}. ${section.title}`,
    "",
    `Chapter: ${section.chapterNumber}. ${section.chapterTitle}`,
    `Source: Magic: The Gathering Comprehensive Rules (effective ${effectiveDate})`,
    "",
    "## Rules",
    "",
    body,
    "",
  ].join("\n");
  fs.writeFileSync(sectionFilePath(section), markdown, "utf-8");
}

function writeGlossaryEntryMarkdown(
  entry: GlossaryEntry,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
  glossaryLookup: Map<string, GlossaryEntry>,
  effectiveDate: string,
): void {
  fs.mkdirSync(path.dirname(glossaryFilePath(entry)), { recursive: true });
  const glossaryIndexPath = path.join(MARKDOWN_OUTPUT_PATH, "glossary", "README.md");
  const groupIndexPath = path.join(MARKDOWN_OUTPUT_PATH, "glossary", glossaryGroupKey(entry), "README.md");
  const glossaryLink = relativeLink(glossaryFilePath(entry), glossaryIndexPath);
  const groupLink = relativeLink(glossaryFilePath(entry), groupIndexPath);
  const body = formatGlossaryLinesForMarkdown(entry, ruleLookup, chapterLookup, glossaryLookup);

  const markdown = [
    `# ${entry.term}`,
    "",
    `[Back to glossary index](${glossaryLink})`,
    `[Back to ${glossaryGroupKey(entry).toUpperCase()} entries](${groupLink})`,
    "",
    `Source: Magic: The Gathering Comprehensive Rules glossary (effective ${effectiveDate})`,
    "",
    "## Definition",
    "",
    body,
    "",
  ].join("\n");

  fs.writeFileSync(glossaryFilePath(entry), markdown, "utf-8");
}

function writeGlossaryAliasMarkdown(glossaryAliases: Map<string, GlossaryEntry>): void {
  for (const [aliasKey, entry] of glossaryAliases.entries()) {
    const aliasDirectoryName = aliasKey[0] && aliasKey[0] >= "a" && aliasKey[0] <= "z" ? aliasKey[0] : "other";
    const aliasPath = path.join(MARKDOWN_OUTPUT_PATH, "glossary", aliasDirectoryName, `${slugify(aliasKey)}.md`);
    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    if (aliasPath === glossaryFilePath(entry)) {
      continue;
    }

    const glossaryIndexPath = path.join(MARKDOWN_OUTPUT_PATH, "glossary", "README.md");
    const glossaryLink = relativeLink(aliasPath, glossaryIndexPath);
    const targetLink = relativeLink(aliasPath, glossaryFilePath(entry));
    const displayTerm = aliasKey
      .split(" ")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");

    fs.writeFileSync(
      aliasPath,
      [
        `# ${displayTerm}`,
        "",
        `[Back to glossary index](${glossaryLink})`,
        "",
        `See [${entry.term}](${targetLink}).`,
        "",
      ].join("\n"),
      "utf-8",
    );
  }
}

function writeMarkdownRootIndex(chapters: Chapter[], sections: Section[], effectiveDate: string): void {
  const chapterSections = new Map<string, Section[]>();
  for (const section of sections) {
    const existing = chapterSections.get(section.chapterNumber) ?? [];
    existing.push(section);
    chapterSections.set(section.chapterNumber, existing);
  }

  const lines: string[] = [
    "# Comprehensive Rules Index",
    "",
    `Generated from the official Magic: The Gathering Comprehensive Rules text (effective ${effectiveDate}).`,
    "",
    "## [Glossary](glossary/README.md)",
    "",
  ];

  for (const chapter of chapters) {
    const chapterIndexPath = path.join(MARKDOWN_OUTPUT_PATH, chapterDirectoryName(chapter), "README.md");
    const chapterLink = relativeLink(path.join(MARKDOWN_OUTPUT_PATH, "README.md"), chapterIndexPath);
    lines.push(`## [${chapter.number}. ${chapter.title}](${chapterLink})`);
    lines.push("");
    for (const section of chapterSections.get(chapter.number) ?? []) {
      const sectionLink = relativeLink(path.join(MARKDOWN_OUTPUT_PATH, "README.md"), sectionFilePath(section));
      lines.push(`- [${section.number}. ${section.title}](${sectionLink})`);
    }
    lines.push("");
  }

  fs.writeFileSync(path.join(MARKDOWN_OUTPUT_PATH, "README.md"), lines.join("\n"), "utf-8");
}

function writeMarkdownChapterIndexes(chapters: Chapter[], sections: Section[]): void {
  const chapterSections = new Map<string, Section[]>();
  for (const section of sections) {
    const existing = chapterSections.get(section.chapterNumber) ?? [];
    existing.push(section);
    chapterSections.set(section.chapterNumber, existing);
  }

  const rootIndexPath = path.join(MARKDOWN_OUTPUT_PATH, "README.md");

  for (const chapter of chapters) {
    const chapterDirectory = path.join(MARKDOWN_OUTPUT_PATH, chapterDirectoryName(chapter));
    fs.mkdirSync(chapterDirectory, { recursive: true });
    const chapterIndexPath = path.join(chapterDirectory, "README.md");
    const rootLink = relativeLink(chapterIndexPath, rootIndexPath);

    const lines: string[] = [
      `# ${chapter.number}. ${chapter.title}`,
      "",
      `[Back to full index](${rootLink})`,
      "",
    ];
    for (const section of chapterSections.get(chapter.number) ?? []) {
      const sectionLink = relativeLink(chapterIndexPath, sectionFilePath(section));
      lines.push(`- [${section.number}. ${section.title}](${sectionLink})`);
    }
    lines.push("");

    fs.writeFileSync(chapterIndexPath, lines.join("\n"), "utf-8");
  }
}

function writeMarkdownGlossaryIndexes(glossaryEntries: GlossaryEntry[]): void {
  const glossaryRoot = path.join(MARKDOWN_OUTPUT_PATH, "glossary");
  fs.mkdirSync(glossaryRoot, { recursive: true });

  const groupedEntries = new Map<string, GlossaryEntry[]>();
  for (const entry of glossaryEntries) {
    const key = glossaryGroupKey(entry);
    const existing = groupedEntries.get(key) ?? [];
    existing.push(entry);
    groupedEntries.set(key, existing);
  }

  const rootLines: string[] = [
    "# Glossary",
    "",
    "Alphabetical glossary extracted from the official Magic: The Gathering Comprehensive Rules.",
    "",
  ];

  const sortedGroups = [...groupedEntries.keys()].sort();
  for (const groupKey of sortedGroups) {
    const groupIndexPath = path.join(glossaryRoot, groupKey, "README.md");
    const groupLink = relativeLink(path.join(glossaryRoot, "README.md"), groupIndexPath);
    rootLines.push(`## [${groupKey.toUpperCase()}](${groupLink})`);
    rootLines.push("");
    for (const entry of groupedEntries.get(groupKey) ?? []) {
      const entryLink = relativeLink(path.join(glossaryRoot, "README.md"), glossaryFilePath(entry));
      rootLines.push(`- [${entry.term}](${entryLink})`);
    }
    rootLines.push("");
  }

  fs.writeFileSync(path.join(glossaryRoot, "README.md"), rootLines.join("\n"), "utf-8");

  for (const groupKey of sortedGroups) {
    const groupDirectory = path.join(glossaryRoot, groupKey);
    fs.mkdirSync(groupDirectory, { recursive: true });
    const groupIndexPath = path.join(groupDirectory, "README.md");
    const rootLink = relativeLink(groupIndexPath, path.join(glossaryRoot, "README.md"));

    const lines: string[] = [
      `# ${groupKey.toUpperCase()} Glossary Entries`,
      "",
      `[Back to glossary index](${rootLink})`,
      "",
    ];

    for (const entry of groupedEntries.get(groupKey) ?? []) {
      const entryLink = relativeLink(groupIndexPath, glossaryFilePath(entry));
      lines.push(`- [${entry.term}](${entryLink})`);
    }
    lines.push("");

    fs.writeFileSync(groupIndexPath, lines.join("\n"), "utf-8");
  }
}

function buildHtmlLink(label: string, pageId: string, anchor: string | null, linkType: string, interactive: boolean = true): string {
  const attrs = [
    `href="${escapeHtml(routeForPage(pageId, anchor))}"`,
    `data-page-id="${escapeHtml(pageId)}"`,
    `data-link-type="${escapeHtml(linkType)}"`,
  ];
  if (anchor) {
    attrs.push(`data-anchor="${escapeHtml(anchor)}"`);
  }
  if (!interactive) {
    attrs.push('tabindex="-1"');
    attrs.push('aria-disabled="true"');
  }
  attrs.push(`class="${interactive ? "rule-link" : "rule-link rule-link--preview"}"`);
  return `<a ${attrs.join(" ")}>${escapeHtml(label)}</a>`;
}

function buildExplicitLinkSpans(
  text: string,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  interactiveLinks: boolean,
): LinkSpan[] {
  const spans: LinkSpan[] = [];

  for (const match of text.matchAll(new RegExp(RULE_REFERENCE_SEQUENCE_RE))) {
    if (match.index === undefined) {
      continue;
    }
    const fullMatch = match[0];
    const sequence = match[1];
    const prefix = fullMatch.slice(0, fullMatch.indexOf(sequence));

    let replacement = escapeHtml(prefix);
    let cursor = 0;
    for (const numberMatch of sequence.matchAll(/\d{3}(?:\.\d+)?[a-z]?/g)) {
      if (numberMatch.index === undefined) {
        continue;
      }
      const ruleNumber = numberMatch[0];
      replacement += escapeHtml(sequence.slice(cursor, numberMatch.index));
      const target = ruleLookup.get(ruleNumber);
      if (target) {
        replacement += buildHtmlLink(ruleNumber, sectionPageId(target.section), target.anchor, "rule", interactiveLinks);
      } else {
        replacement += escapeHtml(ruleNumber);
      }
      cursor = numberMatch.index + ruleNumber.length;
    }
    replacement += escapeHtml(sequence.slice(cursor));

    spans.push({
      start: match.index,
      end: match.index + fullMatch.length,
      replacementHtml: replacement,
      priority: 40,
    });
  }

  for (const match of text.matchAll(new RegExp(GLOSSARY_TERM_REFERENCE_RE))) {
    if (match.index === undefined) {
      continue;
    }
    const fullMatch = match[0];
    const originalTerm = match[1];
    const glossaryEntry = glossaryLookup.get(normalizeGlossaryKey(originalTerm));
    if (!glossaryEntry) {
      continue;
    }
    const prefix = fullMatch.slice(0, fullMatch.indexOf(originalTerm));
    spans.push({
      start: match.index,
      end: match.index + fullMatch.length,
      replacementHtml: `${escapeHtml(prefix)}${buildHtmlLink(originalTerm, glossaryPageId(glossaryEntry), null, "glossary", interactiveLinks)}.`,
      priority: 35,
    });
  }

  return spans;
}

function buildCombinedGlossaryMatcher(glossaryVariants: GlossaryVariant[]): { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> } {
  const terms = [...new Set(glossaryVariants.map((variant) => variant.variantText))]
    .sort((a, b) => b.length - a.length || a.localeCompare(b));

  const escapedParts = terms.map((term) => {
    let part = "";
    for (const ch of term) {
      if (ch === "'" || ch === "’") {
        part += "['’]";
      } else if (/\s/.test(ch)) {
        part += "\\s+";
      } else {
        part += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
    }
    return part;
  });

  const keyToEntry = new Map<string, GlossaryEntry>();
  for (const variant of glossaryVariants) {
    const key = normalizeGlossaryKey(variant.variantText);
    if (!keyToEntry.has(key)) {
      keyToEntry.set(key, variant.entry);
    }
  }

  const regex = new RegExp(`(?<![A-Za-z0-9])(?:${escapedParts.join("|")})(?![A-Za-z0-9])`, "gi");
  return { regex, keyToEntry };
}

function buildAutoGlossarySpans(
  text: string,
  combinedMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  usedTerms: Set<string>,
): LinkSpan[] {
  const candidates: Array<{ start: number; end: number; matchedText: string; entry: GlossaryEntry }> = [];
  combinedMatcher.regex.lastIndex = 0;

  for (const match of text.matchAll(combinedMatcher.regex)) {
    if (match.index === undefined) {
      continue;
    }
    const matchedText = match[0];
    const normalized = normalizeGlossaryKey(matchedText);
    const entry = combinedMatcher.keyToEntry.get(normalized);
    if (!entry) {
      continue;
    }
    const canonicalKey = normalizeGlossaryKey(entry.term);
    if (usedTerms.has(canonicalKey)) {
      continue;
    }
    candidates.push({
      start: match.index,
      end: match.index + matchedText.length,
      matchedText,
      entry,
    });
  }

  candidates.sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenA !== lenB) {
      return lenB - lenA;
    }
    return a.matchedText.localeCompare(b.matchedText);
  });

  const selected: LinkSpan[] = [];
  let occupiedEnd = -1;
  const chosenTerms = new Set<string>();

  for (const candidate of candidates) {
    const canonicalKey = normalizeGlossaryKey(candidate.entry.term);
    if (usedTerms.has(canonicalKey) || chosenTerms.has(canonicalKey)) {
      continue;
    }
    if (candidate.start < occupiedEnd) {
      continue;
    }
    selected.push({
      start: candidate.start,
      end: candidate.end,
      replacementHtml: buildHtmlLink(candidate.matchedText, glossaryPageId(candidate.entry), null, "glossary", true),
      priority: 10,
    });
    occupiedEnd = candidate.end;
    chosenTerms.add(canonicalKey);
  }

  for (const term of chosenTerms) {
    usedTerms.add(term);
  }
  return selected;
}

function applyLinkSpans(text: string, spans: LinkSpan[]): string {
  if (spans.length === 0) {
    return escapeHtml(text);
  }

  const sorted = [...spans].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return (b.end - b.start) - (a.end - a.start);
  });

  const chosen: LinkSpan[] = [];
  let currentEnd = -1;
  for (const span of sorted) {
    if (span.start < currentEnd) {
      continue;
    }
    chosen.push(span);
    currentEnd = span.end;
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const span of chosen) {
    parts.push(escapeHtml(text.slice(cursor, span.start)));
    parts.push(span.replacementHtml);
    cursor = span.end;
  }
  parts.push(escapeHtml(text.slice(cursor)));
  return parts.join("");
}

function renderTextToHtml(
  text: string,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  usedGlossaryTerms: Set<string> | null,
  includeAutoGlossary: boolean,
  interactiveLinks: boolean,
): string {
  const spans = buildExplicitLinkSpans(text, ruleLookup, glossaryLookup, interactiveLinks);
  if (includeAutoGlossary && usedGlossaryTerms) {
    spans.push(...buildAutoGlossarySpans(text, glossaryMatcher, usedGlossaryTerms));
  }
  return applyLinkSpans(text, spans);
}

function renderSectionHtml(
  section: Section,
  sectionRules: RuleEntry[],
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
): string {
  const ruleMap = new Map(sectionRules.map((rule) => [rule.number, rule]));
  const usedGlossaryTerms = new Set<string>();
  const lines: string[] = [
    '<article class="rules-document">',
    '  <header class="document-header">',
    `    <p class="document-kicker">Chapter ${escapeHtml(section.chapterNumber)}. ${escapeHtml(section.chapterTitle)}</p>`,
    `    <h1>${escapeHtml(section.number)}. ${escapeHtml(section.title)}</h1>`,
    "  </header>",
    '  <section class="document-body">',
  ];

  for (const rawLine of section.lines) {
    if (!rawLine.trim()) {
      continue;
    }
    const match = rawLine.match(RULE_LINE_RE);
    if (!match) {
      lines.push(
        `    <p class="rule-continuation">${renderTextToHtml(rawLine, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}</p>`,
      );
      continue;
    }

    const rule = ruleMap.get(match[1]);
    if (!rule) {
      continue;
    }

    lines.push(`    <p class="rule-paragraph" data-rule-number="${escapeHtml(rule.number)}">`);
    lines.push(`      <a class="rule-anchor" id="${escapeHtml(rule.anchor)}"></a>`);
    lines.push(
      `      <span class="rule-number">${escapeHtml(rule.label)}</span> ${renderTextToHtml(rule.text, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}`,
    );
    lines.push("    </p>");
  }

  lines.push("  </section>");
  lines.push("</article>");
  return lines.join("\n");
}

function renderGlossaryHtml(
  entry: GlossaryEntry,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
): string {
  const usedGlossaryTerms = new Set<string>([normalizeGlossaryKey(entry.term)]);
  const lines: string[] = [
    '<article class="glossary-document">',
    '  <header class="document-header">',
    '    <p class="document-kicker">Glossary</p>',
    `    <h1>${escapeHtml(entry.term)}</h1>`,
    "  </header>",
    '  <section class="document-body">',
  ];

  for (const rawLine of entry.bodyLines) {
    if (!rawLine.trim()) {
      continue;
    }
    lines.push(
      `    <p class="glossary-paragraph">${renderTextToHtml(rawLine, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}</p>`,
    );
  }

  lines.push("  </section>");
  lines.push("</article>");
  return lines.join("\n");
}

function renderRulePreviewHtml(
  rule: RuleEntry,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  childCount: number,
): string {
  const usedGlossaryTerms = new Set<string>();
  const lines: string[] = [
    '<div class="rule-preview">',
    `  <p class="preview-title">${escapeHtml(rule.label)}</p>`,
    `  <p class="preview-body">${renderTextToHtml(rule.text, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}</p>`,
  ];
  if (childCount > 0) {
    const noun = childCount === 1 ? "subrule" : "subrules";
    lines.push(`  <p class="preview-note">Contains ${childCount} ${noun}.</p>`);
  }
  lines.push("</div>");
  return lines.join("\n");
}

function renderSectionPreviewHtml(
  section: Section,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  topLevelRuleCount: number,
): string {
  const bodyLine = section.lines.find((line) => line.trim()) ?? section.title;
  const usedGlossaryTerms = new Set<string>();
  const lines: string[] = [
    '<div class="rule-preview">',
    `  <p class="preview-title">${escapeHtml(section.number)}. ${escapeHtml(section.title)}</p>`,
    `  <p class="preview-body">${renderTextToHtml(bodyLine, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}</p>`,
  ];
  if (topLevelRuleCount > 0) {
    const noun = topLevelRuleCount === 1 ? "rule" : "rules";
    lines.push(`  <p class="preview-note">Contains ${topLevelRuleCount} top-level ${noun}.</p>`);
  }
  lines.push("</div>");
  return lines.join("\n");
}

function renderGlossaryPreviewHtml(
  entry: GlossaryEntry,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
): string {
  const bodyLine = entry.bodyLines[0] ?? "";
  const usedGlossaryTerms = new Set<string>([normalizeGlossaryKey(entry.term)]);
  return [
    '<div class="glossary-preview">',
    `  <p class="preview-title">${escapeHtml(entry.term)}</p>`,
    `  <p class="preview-body">${renderTextToHtml(bodyLine, ruleLookup, glossaryLookup, glossaryMatcher, usedGlossaryTerms, true, true)}</p>`,
    "</div>",
  ].join("\n");
}

function writeJson(outputPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
}

function buildNavigationBundle(chapters: Chapter[], sections: Section[], glossaryEntries: GlossaryEntry[], effectiveDate: string): Record<string, unknown> {
  const chapterSections = new Map<string, Section[]>();
  for (const section of sections) {
    const existing = chapterSections.get(section.chapterNumber) ?? [];
    existing.push(section);
    chapterSections.set(section.chapterNumber, existing);
  }

  const groupedGlossary = new Map<string, GlossaryEntry[]>();
  for (const entry of glossaryEntries) {
    const key = glossaryGroupKey(entry);
    const existing = groupedGlossary.get(key) ?? [];
    existing.push(entry);
    groupedGlossary.set(key, existing);
  }

  return {
    generatedFrom: "Magic: The Gathering Comprehensive Rules",
    effectiveDate,
    defaultRoute: "#index",
    rules: chapters.map((chapter) => ({
      number: chapter.number,
      title: chapter.title,
      id: `chapter-${chapter.number}`,
      sections: (chapterSections.get(chapter.number) ?? []).map((section) => ({
        number: section.number,
        title: section.title,
        pageId: sectionPageId(section),
        route: sectionRoute(section),
      })),
    })),
    glossary: [...groupedGlossary.keys()].sort().map((groupKey) => ({
      group: groupKey,
      entries: (groupedGlossary.get(groupKey) ?? []).map((entry) => ({
        term: entry.term,
        pageId: glossaryPageId(entry),
        route: glossaryRoute(entry),
      })),
    })),
  };
}

function buildSearchIndexBundle(sectionRules: Map<string, RuleEntry[]>, sections: Section[], glossaryEntries: GlossaryEntry[]): Record<string, unknown> {
  const sectionLookup = new Map(sections.map((section) => [section.number, section]));
  const ruleDocuments: Array<Record<string, unknown>> = [];

  for (const [sectionNumber, rules] of sectionRules.entries()) {
    const section = sectionLookup.get(sectionNumber);
    if (!section) {
      continue;
    }
    for (const rule of rules) {
      ruleDocuments.push({
        id: `rule:${rule.number}`,
        type: "rule",
        title: rule.number,
        subtitle: `${section.number}. ${section.title}`,
        pageId: sectionPageId(section),
        route: routeForPage(sectionPageId(section), rule.anchor),
        anchor: rule.anchor,
        text: rule.text,
        searchText: `${rule.number} ${section.title} ${rule.text}`,
      });
    }
  }

  const glossaryDocuments = glossaryEntries.map((entry) => ({
    id: `glossary:${glossaryPageSlug(entry)}`,
    type: "glossary",
    title: entry.term,
    subtitle: "Glossary",
    pageId: glossaryPageId(entry),
    route: glossaryRoute(entry),
    text: entry.bodyLines.join(" "),
    searchText: `${entry.term} ${entry.bodyLines.join(" ")}`,
  }));

  return {
    documents: {
      rules: ruleDocuments,
      glossary: glossaryDocuments,
    },
  };
}

function buildPreviewBundle(
  sectionRules: Map<string, RuleEntry[]>,
  sectionLookup: Map<string, Section>,
  glossaryEntries: GlossaryEntry[],
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  childrenMap: Map<string, string[]>,
): Record<string, unknown> {
  const rulePreviews: Record<string, unknown> = {};

  for (const [sectionNumber, rules] of sectionRules.entries()) {
    const section = sectionLookup.get(sectionNumber);
    if (!section) {
      continue;
    }
    const topLevelRuleCount = rules.filter((rule) => rule.parentNumber === section.number).length;
    rulePreviews[section.number] = {
      type: "rule",
      title: `${section.number}. ${section.title}`,
      pageId: sectionPageId(section),
      route: routeForPage(sectionPageId(section), anchorForRule(section.number)),
      anchor: anchorForRule(section.number),
      subruleCount: topLevelRuleCount,
      html: renderSectionPreviewHtml(section, ruleLookup, glossaryLookup, glossaryMatcher, topLevelRuleCount),
    };

    for (const rule of rules) {
      const childCount = (childrenMap.get(rule.number) ?? []).length;
      rulePreviews[rule.number] = {
        type: "rule",
        title: rule.label,
        pageId: sectionPageId(section),
        route: routeForPage(sectionPageId(section), rule.anchor),
        anchor: rule.anchor,
        subruleCount: childCount,
        html: renderRulePreviewHtml(rule, ruleLookup, glossaryLookup, glossaryMatcher, childCount),
      };
    }
  }

  const glossaryPreviews: Record<string, unknown> = {};
  for (const entry of glossaryEntries) {
    glossaryPreviews[glossaryPageSlug(entry)] = {
      type: "glossary",
      term: entry.term,
      pageId: glossaryPageId(entry),
      route: glossaryRoute(entry),
      html: renderGlossaryPreviewHtml(entry, ruleLookup, glossaryLookup, glossaryMatcher),
    };
  }

  return { rules: rulePreviews, glossary: glossaryPreviews };
}

function writeSiteSectionBundle(
  section: Section,
  sectionRules: RuleEntry[],
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  childrenMap: Map<string, string[]>,
): void {
  writeJson(path.join(SITE_CONTENT_PATH, "rules", `${sectionPageSlug(section)}.json`), {
    type: "ruleSection",
    pageId: sectionPageId(section),
    route: sectionRoute(section),
    chapter: { number: section.chapterNumber, title: section.chapterTitle },
    section: { number: section.number, title: section.title },
    html: renderSectionHtml(section, sectionRules, ruleLookup, glossaryLookup, glossaryMatcher),
    plainText: section.lines.join("\n"),
    rules: sectionRules.map((rule) => ({
      number: rule.number,
      label: rule.label,
      anchor: rule.anchor,
      parentNumber: rule.parentNumber,
      subruleCount: (childrenMap.get(rule.number) ?? []).length,
      text: rule.text,
      route: routeForPage(sectionPageId(section), rule.anchor),
    })),
  });
}

function writeSiteGlossaryBundle(
  entry: GlossaryEntry,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
): void {
  writeJson(path.join(SITE_CONTENT_PATH, "glossary", glossaryGroupKey(entry), `${glossaryPageSlug(entry)}.json`), {
    type: "glossaryEntry",
    pageId: glossaryPageId(entry),
    route: glossaryRoute(entry),
    group: glossaryGroupKey(entry),
    term: entry.term,
    html: renderGlossaryHtml(entry, ruleLookup, glossaryLookup, glossaryMatcher),
    plainText: entry.bodyLines.join("\n"),
  });
}

function writeSiteBundles(
  chapters: Chapter[],
  sections: Section[],
  glossaryEntries: GlossaryEntry[],
  sectionRules: Map<string, RuleEntry[]>,
  ruleLookup: RuleLookup,
  glossaryLookup: Map<string, GlossaryEntry>,
  glossaryMatcher: { regex: RegExp; keyToEntry: Map<string, GlossaryEntry> },
  childrenMap: Map<string, string[]>,
  effectiveDate: string,
): void {
  fs.mkdirSync(SITE_OUTPUT_PATH, { recursive: true });
  fs.mkdirSync(SITE_DATA_PATH, { recursive: true });
  fs.mkdirSync(SITE_CONTENT_PATH, { recursive: true });

  const sectionLookup = new Map(sections.map((section) => [section.number, section]));

  for (const section of sections) {
    writeSiteSectionBundle(section, sectionRules.get(section.number) ?? [], ruleLookup, glossaryLookup, glossaryMatcher, childrenMap);
  }

  for (const entry of glossaryEntries) {
    writeSiteGlossaryBundle(entry, ruleLookup, glossaryLookup, glossaryMatcher);
  }

  writeJson(path.join(SITE_DATA_PATH, "navigation.json"), buildNavigationBundle(chapters, sections, glossaryEntries, effectiveDate));
  writeJson(path.join(SITE_DATA_PATH, "search-index.json"), buildSearchIndexBundle(sectionRules, sections, glossaryEntries));
  writeJson(
    path.join(SITE_DATA_PATH, "tooltip-previews.json"),
    buildPreviewBundle(sectionRules, sectionLookup, glossaryEntries, ruleLookup, glossaryLookup, glossaryMatcher, childrenMap),
  );
}

function writeMarkdownOutputs(
  chapters: Chapter[],
  sections: Section[],
  glossaryEntries: GlossaryEntry[],
  glossaryAliases: Map<string, GlossaryEntry>,
  ruleLookup: RuleLookup,
  chapterLookup: Map<string, Chapter>,
  glossaryLookup: Map<string, GlossaryEntry>,
  effectiveDate: string,
): void {
  for (const section of sections) {
    writeSectionMarkdown(section, ruleLookup, chapterLookup, glossaryLookup, effectiveDate);
  }
  for (const entry of glossaryEntries) {
    writeGlossaryEntryMarkdown(entry, ruleLookup, chapterLookup, glossaryLookup, effectiveDate);
  }
  writeGlossaryAliasMarkdown(glossaryAliases);
  writeMarkdownRootIndex(chapters, sections, effectiveDate);
  writeMarkdownChapterIndexes(chapters, sections);
  writeMarkdownGlossaryIndexes(glossaryEntries);
}

export function cleanOutputDirectory(outputPath: string): void {
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
    return;
  }

  function cleanDirectory(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        cleanDirectory(entryPath);
        const remaining = fs.readdirSync(entryPath);
        if (remaining.length === 0) {
          fs.rmdirSync(entryPath);
        }
        continue;
      }

      if (PRESERVED_OUTPUT_FILE_BASENAMES.has(entry.name)) {
        continue;
      }

      fs.rmSync(entryPath, { force: true });
    }
  }

  cleanDirectory(outputPath);
  fs.mkdirSync(outputPath, { recursive: true });
}

function cleanOutputs(): void {
  cleanOutputDirectory(MARKDOWN_OUTPUT_PATH);
  cleanOutputDirectory(SITE_OUTPUT_PATH);
}

export async function parseRules(): Promise<void> {
  const sourceDocument = await ensureLatestRulesDownloaded();
  const lines = fs.readFileSync(sourceDocument.path, "utf-8").split(/\r?\n/);
  const rulesStartIndex = findRulesBodyStart(lines);
  const rulesEndIndex = findRulesBodyEnd(lines, rulesStartIndex);
  const glossaryStartIndex = findGlossaryStart(lines);

  cleanOutputs();

  const { chapters, sections } = parseSections(lines, rulesStartIndex, rulesEndIndex);
  const glossaryEntries = parseGlossary(lines, glossaryStartIndex);
  const sectionRules = new Map<string, RuleEntry[]>(sections.map((section) => [section.number, parseSectionRules(section)]));
  const childrenMap = buildRuleChildrenMap(sectionRules);
  const ruleLookup = buildRuleLookup(sections, sectionRules);
  const glossaryLookup = buildGlossaryLookup(glossaryEntries);
  const glossaryAliases = buildGlossaryAliases(glossaryEntries);
  const glossaryVariants = buildGlossaryVariants(glossaryEntries);
  const glossaryMatcher = buildCombinedGlossaryMatcher(glossaryVariants);
  const chapterLookup = new Map(chapters.map((chapter) => [chapter.number, chapter]));

  writeMarkdownOutputs(chapters, sections, glossaryEntries, glossaryAliases, ruleLookup, chapterLookup, glossaryLookup, sourceDocument.effectiveDate);
  writeSiteBundles(chapters, sections, glossaryEntries, sectionRules, ruleLookup, glossaryLookup, glossaryMatcher, childrenMap, sourceDocument.effectiveDate);
}

export const parserPaths = {
  root: ROOT,
  sourcePath: SOURCE_PATH,
  markdownOutputPath: MARKDOWN_OUTPUT_PATH,
  siteOutputPath: SITE_OUTPUT_PATH,
};
