export interface Chapter {
  number: string;
  title: string;
}

export interface Section {
  chapterNumber: string;
  chapterTitle: string;
  number: string;
  title: string;
  lines: string[];
}

export interface SourceDocument {
  path: string;
  effectiveDate: string;
}

export interface GlossaryEntry {
  term: string;
  bodyLines: string[];
}

export interface RuleEntry {
  sectionNumber: string;
  sectionTitle: string;
  number: string;
  text: string;
  label: string;
  anchor: string;
  parentNumber: string | null;
}

export interface GlossaryVariant {
  canonicalKey: string;
  entry: GlossaryEntry;
  variantText: string;
  pattern: RegExp;
}

export interface LinkSpan {
  start: number;
  end: number;
  replacementHtml: string;
  priority: number;
}
