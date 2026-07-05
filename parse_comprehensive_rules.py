from __future__ import annotations

from dataclasses import dataclass
import html
import json
import os
import re
import shutil
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
SOURCE_DIRECTORY = ROOT / "source"
SOURCE_PATH = SOURCE_DIRECTORY / "MagicCompRules-current.txt"
SOURCE_METADATA_PATH = SOURCE_DIRECTORY / "MagicCompRules-current.json"
MARKDOWN_OUTPUT_PATH = ROOT / "comprehensive-rules"
SITE_OUTPUT_PATH = ROOT / "rules-site"
SITE_ASSETS_PATH = SITE_OUTPUT_PATH / "assets"
SITE_DATA_PATH = SITE_OUTPUT_PATH / "data"
SITE_CONTENT_PATH = SITE_DATA_PATH / "content"
RULES_PAGE_URL = "https://magic.wizards.com/en/rules"
USER_AGENT = "LearnMagicRulesParser/1.0"

MAJOR_HEADER_RE = re.compile(r"^(\d)\. (.+)$")
SECTION_HEADER_RE = re.compile(r"^(\d{3})\. (.+)$")
RULE_LINE_RE = re.compile(r"^(\d{3}(?:\.\d+)?[a-z]?)(?=\.?\s|$)")
RULE_NUMBER_RE = re.compile(r"\d{3}(?:\.\d+)?[a-z]?")
RULE_REFERENCE_SEQUENCE_RE = re.compile(
    r"\brules?\s+(\d{3}(?:\.\d+)?[a-z]?(?:\s*,\s*\d{3}(?:\.\d+)?[a-z]?)*(?:\s*,?\s*(?:and|or)\s*\d{3}(?:\.\d+)?[a-z]?)?)\b",
    re.IGNORECASE,
)
SECTION_REFERENCE_RE = re.compile(r"\bsection (\d)\b", re.IGNORECASE)
TXT_LINK_RE = re.compile(r"https://media\.wizards\.com/\d{4}/downloads/MagicCompRules\s+\d+\.txt")
EFFECTIVE_DATE_RE = re.compile(r"These rules are effective as of (.+?)\.")
GLOSSARY_TERM_REFERENCE_RE = re.compile(r"\bSee(?: also)? ([A-Z][A-Za-z0-9'’/,+\- ]*(?: \([^)]+\))?)\.")
PARENTHETICAL_SUFFIX_RE = re.compile(r"\s*\([^)]+\)$")


@dataclass(frozen=True)
class Chapter:
    number: str
    title: str

    @property
    def directory_name(self) -> str:
        return f"{self.number}-{slugify(self.title)}"


@dataclass(frozen=True)
class Section:
    chapter_number: str
    chapter_title: str
    number: str
    title: str
    lines: tuple[str, ...]

    @property
    def chapter(self) -> Chapter:
        return Chapter(self.chapter_number, self.chapter_title)

    @property
    def file_name(self) -> str:
        return f"{self.number}-{slugify(self.title)}.md"

    @property
    def file_path(self) -> Path:
        return MARKDOWN_OUTPUT_PATH / self.chapter.directory_name / self.file_name

    @property
    def page_slug(self) -> str:
        return f"{self.number}-{slugify(self.title)}"

    @property
    def page_id(self) -> str:
        return f"rules/{self.page_slug}"

    @property
    def route(self) -> str:
        return route_for_page(self.page_id)


@dataclass(frozen=True)
class SourceDocument:
    path: Path
    effective_date: str


@dataclass(frozen=True)
class GlossaryEntry:
    term: str
    body_lines: tuple[str, ...]

    @property
    def group_key(self) -> str:
        first_character = self.term[0].lower()
        if "a" <= first_character <= "z":
            return first_character
        return "other"

    @property
    def file_name(self) -> str:
        return f"{slugify(self.term)}.md"

    @property
    def file_path(self) -> Path:
        return MARKDOWN_OUTPUT_PATH / "glossary" / self.group_key / self.file_name

    @property
    def page_slug(self) -> str:
        return slugify(self.term)

    @property
    def page_id(self) -> str:
        return f"glossary/{self.page_slug}"

    @property
    def route(self) -> str:
        return route_for_page(self.page_id)


@dataclass(frozen=True)
class RuleEntry:
    section_number: str
    section_title: str
    number: str
    text: str
    label: str
    anchor: str
    parent_number: str | None


@dataclass(frozen=True)
class GlossaryVariant:
    canonical_key: str
    entry: GlossaryEntry
    variant_text: str
    pattern: re.Pattern[str]


@dataclass(frozen=True)
class LinkSpan:
    start: int
    end: int
    replacement_html: str
    priority: int


def http_request(url: str, method: str = "GET"):
    request = Request(url, headers={"User-Agent": USER_AGENT}, method=method)
    return urlopen(request)


def normalize_url(url: str) -> str:
    split_url = urlsplit(url)
    normalized_path = quote(split_url.path, safe="/:%")
    return urlunsplit((split_url.scheme, split_url.netloc, normalized_path, split_url.query, split_url.fragment))


def discover_rules_txt_url() -> str:
    with http_request(RULES_PAGE_URL) as response:
        page_html = response.read().decode("utf-8", errors="replace")

    match = TXT_LINK_RE.search(html.unescape(page_html))
    if match is None:
        raise ValueError("Could not find the current Comprehensive Rules TXT link on the official rules page.")
    return normalize_url(match.group(0))


def fetch_remote_metadata(url: str) -> dict[str, str]:
    with http_request(url, method="HEAD") as response:
        headers = response.headers

    return {
        "url": url,
        "etag": headers.get("ETag", ""),
        "last_modified": headers.get("Last-Modified", ""),
        "content_length": headers.get("Content-Length", ""),
    }


def load_local_metadata() -> dict[str, str]:
    if not SOURCE_METADATA_PATH.exists():
        return {}
    return json.loads(SOURCE_METADATA_PATH.read_text(encoding="utf-8"))


def is_remote_newer(local_metadata: dict[str, str], remote_metadata: dict[str, str]) -> bool:
    if not SOURCE_PATH.exists():
        return True

    if local_metadata.get("url") != remote_metadata.get("url"):
        return True

    if remote_metadata.get("etag") and local_metadata.get("etag") != remote_metadata.get("etag"):
        return True

    if remote_metadata.get("last_modified") and local_metadata.get("last_modified") != remote_metadata.get("last_modified"):
        return True

    if remote_metadata.get("content_length") and local_metadata.get("content_length") != remote_metadata.get("content_length"):
        return True

    return False


def download_rules_file(url: str) -> None:
    SOURCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    with http_request(url) as response:
        SOURCE_PATH.write_bytes(response.read())


def extract_effective_date(lines: list[str]) -> str:
    for line in lines[:20]:
        match = EFFECTIVE_DATE_RE.search(line)
        if match:
            return match.group(1)
    raise ValueError("Could not find the rules effective date in the source document.")


def ensure_latest_rules_downloaded() -> SourceDocument:
    rules_url = discover_rules_txt_url()
    remote_metadata = fetch_remote_metadata(rules_url)
    local_metadata = load_local_metadata()

    if is_remote_newer(local_metadata, remote_metadata):
        download_rules_file(rules_url)
        SOURCE_METADATA_PATH.write_text(json.dumps(remote_metadata, indent=2), encoding="utf-8")

    if not SOURCE_PATH.exists():
        raise FileNotFoundError(f"Source rules file not found after download check: {SOURCE_PATH}")

    lines = SOURCE_PATH.read_text(encoding="utf-8").splitlines()
    return SourceDocument(path=SOURCE_PATH, effective_date=extract_effective_date(lines))


def normalize_glossary_key(term: str) -> str:
    normalized = term.replace("’", "'").strip().lower()
    normalized = PARENTHETICAL_SUFFIX_RE.sub("", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def slugify(value: str) -> str:
    slug = value.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def route_for_page(page_id: str, anchor: str | None = None) -> str:
    if anchor:
        return f"#{page_id}/{anchor}"
    return f"#{page_id}"


def find_rules_body_start(lines: list[str]) -> int:
    matches = [index for index, line in enumerate(lines) if line == "1. Game Concepts"]
    if len(matches) < 2:
        raise ValueError("Could not find the start of the rules body.")
    return matches[1]


def find_rules_body_end(lines: list[str], start_index: int) -> int:
    for index in range(start_index + 1, len(lines)):
        if lines[index] == "Glossary":
            return index
    return len(lines)


def find_glossary_start(lines: list[str]) -> int:
    matches = [index for index, line in enumerate(lines) if line == "Glossary"]
    if len(matches) < 2:
        raise ValueError("Could not find the start of the glossary.")
    return matches[1]


def anchor_for_rule(rule_number: str) -> str:
    return f"rule-{rule_number.replace('.', '-')}"


def relative_link(from_path: Path, to_path: Path, anchor: str | None = None) -> str:
    relative_path = Path(os.path.relpath(to_path, start=from_path.parent)).as_posix()
    if anchor:
        return f"{relative_path}#{anchor}"
    return relative_path


def parse_sections(lines: list[str], start_index: int, end_index: int) -> tuple[list[Chapter], list[Section]]:
    chapters: list[Chapter] = []
    sections: list[Section] = []

    current_chapter_number: str | None = None
    current_chapter_title: str | None = None
    current_section_number: str | None = None
    current_section_title: str | None = None
    current_section_lines: list[str] = []

    def flush_current_section() -> None:
        if not all([current_chapter_number, current_chapter_title, current_section_number, current_section_title]):
            return
        sections.append(
            Section(
                chapter_number=current_chapter_number,
                chapter_title=current_chapter_title,
                number=current_section_number,
                title=current_section_title,
                lines=tuple(current_section_lines),
            )
        )

    for line in lines[start_index:end_index]:
        major_match = MAJOR_HEADER_RE.match(line)
        section_match = SECTION_HEADER_RE.match(line)

        if major_match:
            flush_current_section()
            current_chapter_number, current_chapter_title = major_match.groups()
            chapters.append(Chapter(current_chapter_number, current_chapter_title))
            current_section_number = None
            current_section_title = None
            current_section_lines = []
            continue

        if section_match:
            flush_current_section()
            current_section_number, current_section_title = section_match.groups()
            current_section_lines = []
            continue

        if current_section_number:
            current_section_lines.append(line)

    flush_current_section()
    return chapters, sections


def parse_glossary(lines: list[str], glossary_start_index: int) -> list[GlossaryEntry]:
    entries: list[GlossaryEntry] = []
    current_block: list[str] = []

    def flush_block() -> None:
        if not current_block:
            return
        term = current_block[0].strip()
        body_lines = tuple(line.rstrip() for line in current_block[1:])
        if term and body_lines:
            entries.append(GlossaryEntry(term=term, body_lines=body_lines))

    for line in lines[glossary_start_index + 1 :]:
        if line.strip() == "":
            flush_block()
            current_block = []
            continue
        current_block.append(line)

    flush_block()
    return entries


def parse_section_rules(section: Section) -> list[RuleEntry]:
    rules: list[RuleEntry] = []

    for line in section.lines:
        match = RULE_LINE_RE.match(line)
        if match is None:
            continue
        rule_number = match.group(1)
        after_number = line[match.end() :]
        if after_number.startswith("."):
            label = f"{rule_number}."
            text = after_number[1:].lstrip()
        else:
            label = rule_number
            text = after_number.lstrip()

        parent_number = derive_parent_rule_number(section.number, rule_number)
        rules.append(
            RuleEntry(
                section_number=section.number,
                section_title=section.title,
                number=rule_number,
                text=text,
                label=label,
                anchor=anchor_for_rule(rule_number),
                parent_number=parent_number,
            )
        )

    return rules


def derive_parent_rule_number(section_number: str, rule_number: str) -> str | None:
    if re.fullmatch(r"\d{3}\.\d+[a-z]", rule_number):
        return re.sub(r"[a-z]$", "", rule_number)
    if re.fullmatch(r"\d{3}\.\d+", rule_number):
        return section_number
    return None


def build_rule_lookup(sections: list[Section], section_rules: dict[str, list[RuleEntry]]) -> dict[str, tuple[Section, str]]:
    rule_lookup: dict[str, tuple[Section, str]] = {}

    for section in sections:
        rule_lookup[section.number] = (section, anchor_for_rule(section.number))
        for rule in section_rules[section.number]:
            rule_lookup[rule.number] = (section, rule.anchor)

    return rule_lookup


def build_rule_children_map(section_rules: dict[str, list[RuleEntry]]) -> dict[str, list[str]]:
    children_map: dict[str, list[str]] = {}

    for rules in section_rules.values():
        for rule in rules:
            if rule.parent_number is None:
                continue
            children_map.setdefault(rule.parent_number, []).append(rule.number)

    return children_map


def build_glossary_lookup(glossary_entries: list[GlossaryEntry]) -> dict[str, GlossaryEntry]:
    glossary_lookup: dict[str, GlossaryEntry] = {}

    for entry in glossary_entries:
        glossary_lookup[normalize_glossary_key(entry.term)] = entry

        stripped_term = PARENTHETICAL_SUFFIX_RE.sub("", entry.term).strip()
        glossary_lookup.setdefault(normalize_glossary_key(stripped_term), entry)

        if entry.term == "Timestamp Order":
            glossary_lookup.setdefault("timestamp", entry)

    return glossary_lookup


def build_glossary_aliases(glossary_entries: list[GlossaryEntry]) -> dict[str, GlossaryEntry]:
    glossary_aliases: dict[str, GlossaryEntry] = {}

    for entry in glossary_entries:
        canonical_key = normalize_glossary_key(entry.term)
        stripped_term = PARENTHETICAL_SUFFIX_RE.sub("", entry.term).strip()
        stripped_key = normalize_glossary_key(stripped_term)
        if stripped_key and stripped_key != canonical_key:
            glossary_aliases.setdefault(stripped_key, entry)

        if entry.term == "Timestamp Order":
            glossary_aliases.setdefault("timestamp", entry)

    return glossary_aliases


def build_glossary_variants(glossary_entries: list[GlossaryEntry]) -> list[GlossaryVariant]:
    variants: dict[tuple[str, str], GlossaryVariant] = {}

    for entry in glossary_entries:
        canonical_key = normalize_glossary_key(entry.term)
        candidate_terms = {entry.term, PARENTHETICAL_SUFFIX_RE.sub("", entry.term).strip()}

        for candidate in list(candidate_terms):
            candidate_terms.update(generate_simple_variants(candidate))

        for candidate in candidate_terms:
            normalized_candidate = normalize_glossary_key(candidate)
            if not normalized_candidate:
                continue
            key = (canonical_key, normalized_candidate)
            variants.setdefault(
                key,
                GlossaryVariant(
                    canonical_key=canonical_key,
                    entry=entry,
                    variant_text=candidate,
                    pattern=compile_term_pattern(candidate),
                ),
            )

    return sorted(variants.values(), key=lambda variant: (-len(variant.variant_text), variant.variant_text.lower()))


def generate_simple_variants(term: str) -> set[str]:
    variants: set[str] = set()
    words = term.split()
    if not words:
        return variants

    last_word = words[-1]
    if not re.fullmatch(r"[A-Za-z]+", last_word):
        return variants

    plural = pluralize_word(last_word)
    if plural != last_word:
        variants.add(" ".join([*words[:-1], plural]))

    return variants


def pluralize_word(word: str) -> str:
    lower_word = word.lower()
    if lower_word.endswith(("s", "x", "z", "ch", "sh")):
        return f"{word}es"
    if lower_word.endswith("y") and len(word) > 1 and lower_word[-2] not in "aeiou":
        return f"{word[:-1]}ies"
    return f"{word}s"


def compile_term_pattern(term: str) -> re.Pattern[str]:
    pieces: list[str] = []
    for character in term:
        if character in {"'", "’"}:
            pieces.append(r"['’]")
        elif character.isspace():
            pieces.append(r"\s+")
        else:
            pieces.append(re.escape(character))

    return re.compile(rf"(?<![A-Za-z0-9]){''.join(pieces)}(?![A-Za-z0-9])", re.IGNORECASE)


def build_markdown_rule_references(text: str, current_path: Path, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter]) -> str:
    def replace_rule_sequence(match: re.Match[str]) -> str:
        prefix = match.group(0)[: match.start(1) - match.start(0)]
        sequence = match.group(1)

        def replace_rule_number(number_match: re.Match[str]) -> str:
            rule_number = number_match.group(0)
            if rule_number not in rule_lookup:
                return rule_number
            target_section, anchor = rule_lookup[rule_number]
            link = relative_link(current_path, target_section.file_path, anchor)
            return f"[{rule_number}]({link})"

        return f"{prefix}{RULE_NUMBER_RE.sub(replace_rule_number, sequence)}"

    def replace_section(match: re.Match[str]) -> str:
        chapter_number = match.group(1)
        chapter = chapter_lookup.get(chapter_number)
        if chapter is None:
            return match.group(0)
        chapter_index_path = MARKDOWN_OUTPUT_PATH / chapter.directory_name / "README.md"
        link = relative_link(current_path, chapter_index_path)
        return f"section [{chapter_number}]({link})"

    linked_text = RULE_REFERENCE_SEQUENCE_RE.sub(replace_rule_sequence, text)
    linked_text = SECTION_REFERENCE_RE.sub(replace_section, linked_text)
    return linked_text


def build_markdown_glossary_references(text: str, current_path: Path, glossary_lookup: dict[str, GlossaryEntry]) -> str:
    def replace_term(match: re.Match[str]) -> str:
        original_term = match.group(1)
        normalized_term = normalize_glossary_key(original_term)
        glossary_entry = glossary_lookup.get(normalized_term)
        if glossary_entry is None:
            return match.group(0)
        link = relative_link(current_path, glossary_entry.file_path)
        prefix = match.group(0)[: match.group(0).find(original_term)]
        return f"{prefix}[{original_term}]({link})."

    return GLOSSARY_TERM_REFERENCE_RE.sub(replace_term, text)


def format_section_lines_for_markdown(section: Section, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry]) -> str:
    formatted_lines: list[str] = []

    for line in section.lines:
        linked_line = build_markdown_rule_references(line, section.file_path, rule_lookup, chapter_lookup)
        linked_line = build_markdown_glossary_references(linked_line, section.file_path, glossary_lookup)
        match = RULE_LINE_RE.match(linked_line)
        if match:
            formatted_lines.append(f'<a id="{anchor_for_rule(match.group(1))}"></a>')
        formatted_lines.append(linked_line)

    return "\n".join(formatted_lines).strip()


def format_glossary_lines_for_markdown(entry: GlossaryEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry]) -> str:
    formatted_lines: list[str] = []

    for line in entry.body_lines:
        linked_line = build_markdown_rule_references(line, entry.file_path, rule_lookup, chapter_lookup)
        linked_line = build_markdown_glossary_references(linked_line, entry.file_path, glossary_lookup)
        formatted_lines.append(linked_line)

    return "\n".join(formatted_lines).strip()


def write_section_markdown(section: Section, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], effective_date: str) -> None:
    section.file_path.parent.mkdir(parents=True, exist_ok=True)
    body = format_section_lines_for_markdown(section, rule_lookup, chapter_lookup, glossary_lookup)
    markdown = "\n".join([
        f"# {section.number}. {section.title}",
        "",
        f"Chapter: {section.chapter_number}. {section.chapter_title}",
        f"Source: Magic: The Gathering Comprehensive Rules (effective {effective_date})",
        "",
        "## Rules",
        "",
        body,
        "",
    ])
    section.file_path.write_text(markdown, encoding="utf-8")


def write_glossary_entry_markdown(entry: GlossaryEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], effective_date: str) -> None:
    entry.file_path.parent.mkdir(parents=True, exist_ok=True)
    glossary_index_path = MARKDOWN_OUTPUT_PATH / "glossary" / "README.md"
    group_index_path = MARKDOWN_OUTPUT_PATH / "glossary" / entry.group_key / "README.md"
    glossary_link = relative_link(entry.file_path, glossary_index_path)
    group_link = relative_link(entry.file_path, group_index_path)
    body = format_glossary_lines_for_markdown(entry, rule_lookup, chapter_lookup, glossary_lookup)
    markdown = "\n".join([
        f"# {entry.term}",
        "",
        f"[Back to glossary index]({glossary_link})",
        f"[Back to {entry.group_key.upper()} entries]({group_link})",
        "",
        f"Source: Magic: The Gathering Comprehensive Rules glossary (effective {effective_date})",
        "",
        "## Definition",
        "",
        body,
        "",
    ])
    entry.file_path.write_text(markdown, encoding="utf-8")


def write_glossary_alias_markdown(glossary_aliases: dict[str, GlossaryEntry]) -> None:
    for alias_key, entry in glossary_aliases.items():
        alias_directory_name = alias_key[0] if alias_key and "a" <= alias_key[0] <= "z" else "other"
        alias_path = MARKDOWN_OUTPUT_PATH / "glossary" / alias_directory_name / f"{slugify(alias_key)}.md"
        alias_path.parent.mkdir(parents=True, exist_ok=True)
        if alias_path == entry.file_path:
            continue
        glossary_index_path = MARKDOWN_OUTPUT_PATH / "glossary" / "README.md"
        glossary_link = relative_link(alias_path, glossary_index_path)
        target_link = relative_link(alias_path, entry.file_path)
        display_term = " ".join(part.capitalize() for part in alias_key.split())
        alias_path.write_text("\n".join([
            f"# {display_term}",
            "",
            f"[Back to glossary index]({glossary_link})",
            "",
            f"See [{entry.term}]({target_link}).",
            "",
        ]), encoding="utf-8")


def write_markdown_root_index(chapters: list[Chapter], sections: list[Section], effective_date: str) -> None:
    chapter_sections: dict[str, list[Section]] = {}
    for section in sections:
        chapter_sections.setdefault(section.chapter_number, []).append(section)

    lines = [
        "# Comprehensive Rules Index",
        "",
        f"Generated from the official Magic: The Gathering Comprehensive Rules text (effective {effective_date}).",
        "",
        "## [Glossary](glossary/README.md)",
        "",
    ]

    for chapter in chapters:
        chapter_index_path = MARKDOWN_OUTPUT_PATH / chapter.directory_name / "README.md"
        chapter_link = relative_link(MARKDOWN_OUTPUT_PATH / "README.md", chapter_index_path)
        lines.append(f"## [{chapter.number}. {chapter.title}]({chapter_link})")
        lines.append("")
        for section in chapter_sections.get(chapter.number, []):
            section_link = relative_link(MARKDOWN_OUTPUT_PATH / "README.md", section.file_path)
            lines.append(f"- [{section.number}. {section.title}]({section_link})")
        lines.append("")

    (MARKDOWN_OUTPUT_PATH / "README.md").write_text("\n".join(lines), encoding="utf-8")


def write_markdown_chapter_indexes(chapters: list[Chapter], sections: list[Section]) -> None:
    chapter_sections: dict[str, list[Section]] = {}
    for section in sections:
        chapter_sections.setdefault(section.chapter_number, []).append(section)

    root_index_path = MARKDOWN_OUTPUT_PATH / "README.md"
    for chapter in chapters:
        chapter_directory = MARKDOWN_OUTPUT_PATH / chapter.directory_name
        chapter_directory.mkdir(parents=True, exist_ok=True)
        chapter_index_path = chapter_directory / "README.md"
        root_link = relative_link(chapter_index_path, root_index_path)
        lines = [
            f"# {chapter.number}. {chapter.title}",
            "",
            f"[Back to full index]({root_link})",
            "",
        ]
        for section in chapter_sections.get(chapter.number, []):
            section_link = relative_link(chapter_index_path, section.file_path)
            lines.append(f"- [{section.number}. {section.title}]({section_link})")
        lines.append("")
        chapter_index_path.write_text("\n".join(lines), encoding="utf-8")


def write_markdown_glossary_indexes(glossary_entries: list[GlossaryEntry]) -> None:
    glossary_root = MARKDOWN_OUTPUT_PATH / "glossary"
    glossary_root.mkdir(parents=True, exist_ok=True)
    grouped_entries: dict[str, list[GlossaryEntry]] = {}
    for entry in glossary_entries:
        grouped_entries.setdefault(entry.group_key, []).append(entry)

    root_lines = [
        "# Glossary",
        "",
        "Alphabetical glossary extracted from the official Magic: The Gathering Comprehensive Rules.",
        "",
    ]
    for group_key in sorted(grouped_entries):
        group_index_path = glossary_root / group_key / "README.md"
        group_link = relative_link(glossary_root / "README.md", group_index_path)
        root_lines.append(f"## [{group_key.upper()}]({group_link})")
        root_lines.append("")
        for entry in grouped_entries[group_key]:
            entry_link = relative_link(glossary_root / "README.md", entry.file_path)
            root_lines.append(f"- [{entry.term}]({entry_link})")
        root_lines.append("")

    (glossary_root / "README.md").write_text("\n".join(root_lines), encoding="utf-8")

    for group_key in sorted(grouped_entries):
        group_directory = glossary_root / group_key
        group_directory.mkdir(parents=True, exist_ok=True)
        group_index_path = group_directory / "README.md"
        root_link = relative_link(group_index_path, glossary_root / "README.md")
        lines = [
            f"# {group_key.upper()} Glossary Entries",
            "",
            f"[Back to glossary index]({root_link})",
            "",
        ]
        for entry in grouped_entries[group_key]:
            entry_link = relative_link(group_index_path, entry.file_path)
            lines.append(f"- [{entry.term}]({entry_link})")
        lines.append("")
        group_index_path.write_text("\n".join(lines), encoding="utf-8")


def build_html_link(label: str, page_id: str, anchor: str | None, link_type: str, interactive: bool = True) -> str:
    attributes = [
        f'href="{html.escape(route_for_page(page_id, anchor), quote=True)}"',
        f'data-page-id="{html.escape(page_id, quote=True)}"',
        f'data-link-type="{html.escape(link_type, quote=True)}"',
    ]
    if anchor:
        attributes.append(f'data-anchor="{html.escape(anchor, quote=True)}"')
    if not interactive:
        attributes.append('tabindex="-1"')
        attributes.append('aria-disabled="true"')
    attributes.append(f'class="{"rule-link" if interactive else "rule-link rule-link--preview"}"')
    return f"<a {' '.join(attributes)}>{html.escape(label)}</a>"


def build_explicit_link_spans(text: str, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], interactive_links: bool) -> list[LinkSpan]:
    spans: list[LinkSpan] = []

    for match in RULE_REFERENCE_SEQUENCE_RE.finditer(text):
        prefix = match.group(0)[: match.start(1) - match.start(0)]
        sequence = match.group(1)
        replacement_parts: list[str] = [html.escape(prefix)]
        cursor = 0

        for number_match in RULE_NUMBER_RE.finditer(sequence):
            rule_number = number_match.group(0)
            replacement_parts.append(html.escape(sequence[cursor:number_match.start()]))
            if rule_number in rule_lookup:
                target_section, anchor = rule_lookup[rule_number]
                replacement_parts.append(build_html_link(rule_number, target_section.page_id, anchor, "rule", interactive_links))
            else:
                replacement_parts.append(html.escape(rule_number))
            cursor = number_match.end()

        replacement_parts.append(html.escape(sequence[cursor:]))
        spans.append(LinkSpan(match.start(), match.end(), "".join(replacement_parts), 40))

    for match in GLOSSARY_TERM_REFERENCE_RE.finditer(text):
        original_term = match.group(1)
        glossary_entry = glossary_lookup.get(normalize_glossary_key(original_term))
        if glossary_entry is None:
            continue
        prefix = match.group(0)[: match.group(0).find(original_term)]
        spans.append(LinkSpan(match.start(), match.end(), f"{html.escape(prefix)}{build_html_link(original_term, glossary_entry.page_id, None, 'glossary', interactive_links)}.", 35))

    return spans


def build_auto_glossary_spans(text: str, glossary_variants: list[GlossaryVariant], used_terms: set[str]) -> list[LinkSpan]:
    candidates: list[tuple[int, int, str, GlossaryEntry]] = []
    for variant in glossary_variants:
        if variant.canonical_key in used_terms:
            continue
        for match in variant.pattern.finditer(text):
            candidates.append((match.start(), match.end(), match.group(0), variant.entry))

    selected: list[LinkSpan] = []
    occupied_end = -1
    chosen_terms: list[str] = []
    for start, end, matched_text, entry in sorted(candidates, key=lambda item: (item[0], -(item[1] - item[0]), item[2].lower())):
        canonical_key = normalize_glossary_key(entry.term)
        if canonical_key in used_terms or canonical_key in chosen_terms:
            continue
        if start < occupied_end:
            continue
        selected.append(LinkSpan(start, end, build_html_link(matched_text, entry.page_id, None, "glossary", True), 10))
        occupied_end = end
        chosen_terms.append(canonical_key)

    used_terms.update(chosen_terms)
    return selected


def apply_link_spans(text: str, spans: list[LinkSpan]) -> str:
    if not spans:
        return html.escape(text)

    chosen: list[LinkSpan] = []
    current_end = -1
    for span in sorted(spans, key=lambda item: (item.start, -item.priority, -(item.end - item.start))):
        if span.start < current_end:
            continue
        chosen.append(span)
        current_end = span.end

    parts: list[str] = []
    cursor = 0
    for span in chosen:
        parts.append(html.escape(text[cursor:span.start]))
        parts.append(span.replacement_html)
        cursor = span.end
    parts.append(html.escape(text[cursor:]))
    return "".join(parts)


def render_text_to_html(text: str, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], used_glossary_terms: set[str] | None, include_auto_glossary: bool, interactive_links: bool) -> str:
    spans = build_explicit_link_spans(text, rule_lookup, chapter_lookup, glossary_lookup, interactive_links)
    if include_auto_glossary and used_glossary_terms is not None:
        spans.extend(build_auto_glossary_spans(text, glossary_variants, used_glossary_terms))
    return apply_link_spans(text, spans)


def render_section_html(section: Section, section_rules: list[RuleEntry], rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant]) -> str:
    rule_map = {rule.number: rule for rule in section_rules}
    used_glossary_terms: set[str] = set()
    lines = [
        '<article class="rules-document">',
        '  <header class="document-header">',
        f'    <p class="document-kicker">Chapter {html.escape(section.chapter_number)}. {html.escape(section.chapter_title)}</p>',
        f'    <h1>{html.escape(section.number)}. {html.escape(section.title)}</h1>',
        '  </header>',
        '  <section class="document-body">',
    ]
    for raw_line in section.lines:
        if not raw_line.strip():
            continue
        match = RULE_LINE_RE.match(raw_line)
        if match is None:
            lines.append(f'    <p class="rule-continuation">{render_text_to_html(raw_line, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}</p>')
            continue
        rule = rule_map[match.group(1)]
        lines.extend([
            f'    <p class="rule-paragraph" data-rule-number="{html.escape(rule.number, quote=True)}">',
            f'      <a class="rule-anchor" id="{html.escape(rule.anchor, quote=True)}"></a>',
            f'      <span class="rule-number">{html.escape(rule.label)}</span> {render_text_to_html(rule.text, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}',
            '    </p>',
        ])
    lines.extend(['  </section>', '</article>'])
    return "\n".join(lines)


def render_glossary_html(entry: GlossaryEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant]) -> str:
    used_glossary_terms: set[str] = {normalize_glossary_key(entry.term)}
    lines = [
        '<article class="glossary-document">',
        '  <header class="document-header">',
        '    <p class="document-kicker">Glossary</p>',
        f'    <h1>{html.escape(entry.term)}</h1>',
        '  </header>',
        '  <section class="document-body">',
    ]
    for raw_line in entry.body_lines:
        if not raw_line.strip():
            continue
        lines.append(f'    <p class="glossary-paragraph">{render_text_to_html(raw_line, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}</p>')
    lines.extend(['  </section>', '</article>'])
    return "\n".join(lines)


def render_rule_preview_html(rule: RuleEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], child_count: int) -> str:
    used_glossary_terms: set[str] = set()
    lines = [
        '<div class="rule-preview">',
        f'  <p class="preview-title">{html.escape(rule.label)}</p>',
        f'  <p class="preview-body">{render_text_to_html(rule.text, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}</p>',
    ]
    if child_count > 0:
        noun = "subrule" if child_count == 1 else "subrules"
        lines.append(f'  <p class="preview-note">Contains {child_count} {noun}.</p>')
    lines.append('</div>')
    return "\n".join(lines)


def render_section_preview_html(section: Section, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], top_level_rule_count: int) -> str:
    body_line = next((line for line in section.lines if line.strip()), section.title)
    used_glossary_terms: set[str] = set()
    lines = [
        '<div class="rule-preview">',
        f'  <p class="preview-title">{html.escape(section.number)}. {html.escape(section.title)}</p>',
        f'  <p class="preview-body">{render_text_to_html(body_line, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}</p>',
    ]
    if top_level_rule_count > 0:
        noun = "rule" if top_level_rule_count == 1 else "rules"
        lines.append(f'  <p class="preview-note">Contains {top_level_rule_count} top-level {noun}.</p>')
    lines.append('</div>')
    return "\n".join(lines)


def render_glossary_preview_html(entry: GlossaryEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant]) -> str:
    body_line = entry.body_lines[0] if entry.body_lines else ""
    used_glossary_terms: set[str] = {normalize_glossary_key(entry.term)}
    return "\n".join([
        '<div class="glossary-preview">',
        f'  <p class="preview-title">{html.escape(entry.term)}</p>',
        f'  <p class="preview-body">{render_text_to_html(body_line, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, used_glossary_terms, True, True)}</p>',
        '</div>',
    ])


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def build_navigation_bundle(chapters: list[Chapter], sections: list[Section], glossary_entries: list[GlossaryEntry], effective_date: str) -> dict[str, object]:
    chapter_sections: dict[str, list[Section]] = {}
    for section in sections:
        chapter_sections.setdefault(section.chapter_number, []).append(section)

    grouped_glossary: dict[str, list[GlossaryEntry]] = {}
    for entry in glossary_entries:
        grouped_glossary.setdefault(entry.group_key, []).append(entry)

    return {
        "generatedFrom": "Magic: The Gathering Comprehensive Rules",
        "effectiveDate": effective_date,
        "defaultRoute": "#index",
        "rules": [
            {
                "number": chapter.number,
                "title": chapter.title,
                "id": f"chapter-{chapter.number}",
                "sections": [
                    {
                        "number": section.number,
                        "title": section.title,
                        "pageId": section.page_id,
                        "route": section.route,
                    }
                    for section in chapter_sections.get(chapter.number, [])
                ],
            }
            for chapter in chapters
        ],
        "glossary": [
            {
                "group": group_key,
                "entries": [{"term": entry.term, "pageId": entry.page_id, "route": entry.route} for entry in grouped_glossary[group_key]],
            }
            for group_key in sorted(grouped_glossary)
        ],
    }


def build_search_index_bundle(section_rules: dict[str, list[RuleEntry]], sections: list[Section], glossary_entries: list[GlossaryEntry]) -> dict[str, object]:
    section_lookup = {section.number: section for section in sections}
    rule_documents: list[dict[str, object]] = []
    for section_number, rules in section_rules.items():
        section = section_lookup[section_number]
        for rule in rules:
            rule_documents.append({
                "id": f"rule:{rule.number}",
                "type": "rule",
                "title": rule.number,
                "subtitle": f"{section.number}. {section.title}",
                "pageId": section.page_id,
                "route": route_for_page(section.page_id, rule.anchor),
                "anchor": rule.anchor,
                "text": rule.text,
                "searchText": f"{rule.number} {section.title} {rule.text}",
            })

    glossary_documents = [{
        "id": f"glossary:{entry.page_slug}",
        "type": "glossary",
        "title": entry.term,
        "subtitle": "Glossary",
        "pageId": entry.page_id,
        "route": entry.route,
        "text": " ".join(entry.body_lines),
        "searchText": f"{entry.term} {' '.join(entry.body_lines)}",
    } for entry in glossary_entries]

    return {"documents": {"rules": rule_documents, "glossary": glossary_documents}}


def build_preview_bundle(section_rules: dict[str, list[RuleEntry]], section_lookup: dict[str, Section], glossary_entries: list[GlossaryEntry], rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], children_map: dict[str, list[str]]) -> dict[str, object]:
    rule_previews: dict[str, object] = {}
    for section_number, rules in section_rules.items():
        section = section_lookup[section_number]
        top_level_rule_count = sum(1 for rule in rules if rule.parent_number == section.number)
        rule_previews[section.number] = {
            "type": "rule",
            "title": f"{section.number}. {section.title}",
            "pageId": section.page_id,
            "route": route_for_page(section.page_id, anchor_for_rule(section.number)),
            "anchor": anchor_for_rule(section.number),
            "subruleCount": top_level_rule_count,
            "html": render_section_preview_html(section, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, top_level_rule_count),
        }
        for rule in rules:
            child_count = len(children_map.get(rule.number, []))
            rule_previews[rule.number] = {
                "type": "rule",
                "title": rule.label,
                "pageId": section.page_id,
                "route": route_for_page(section.page_id, rule.anchor),
                "anchor": rule.anchor,
                "subruleCount": child_count,
                "html": render_rule_preview_html(rule, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, child_count),
            }

    glossary_previews = {
        entry.page_slug: {
            "type": "glossary",
            "term": entry.term,
            "pageId": entry.page_id,
            "route": entry.route,
            "html": render_glossary_preview_html(entry, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants),
        }
        for entry in glossary_entries
    }

    return {"rules": rule_previews, "glossary": glossary_previews}


def write_site_section_bundle(section: Section, section_rules: list[RuleEntry], rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], children_map: dict[str, list[str]]) -> None:
    write_json(SITE_CONTENT_PATH / "rules" / f"{section.page_slug}.json", {
        "type": "ruleSection",
        "pageId": section.page_id,
        "route": section.route,
        "chapter": {"number": section.chapter_number, "title": section.chapter_title},
        "section": {"number": section.number, "title": section.title},
        "html": render_section_html(section, section_rules, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants),
        "plainText": "\n".join(section.lines),
        "rules": [{
            "number": rule.number,
            "label": rule.label,
            "anchor": rule.anchor,
            "parentNumber": rule.parent_number,
            "subruleCount": len(children_map.get(rule.number, [])),
            "text": rule.text,
            "route": route_for_page(section.page_id, rule.anchor),
        } for rule in section_rules],
    })


def write_site_glossary_bundle(entry: GlossaryEntry, rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant]) -> None:
    write_json(SITE_CONTENT_PATH / "glossary" / entry.group_key / f"{entry.page_slug}.json", {
        "type": "glossaryEntry",
        "pageId": entry.page_id,
        "route": entry.route,
        "group": entry.group_key,
        "term": entry.term,
        "html": render_glossary_html(entry, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants),
        "plainText": "\n".join(entry.body_lines),
    })


def write_site_shell() -> None:
    SITE_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    SITE_ASSETS_PATH.mkdir(parents=True, exist_ok=True)
    template_root = ROOT / "site-template"
    shutil.copy2(template_root / "index.html", SITE_OUTPUT_PATH / "index.html")
    shutil.copy2(template_root / "assets" / "app.css", SITE_ASSETS_PATH / "app.css")
    shutil.copy2(template_root / "assets" / "app.js", SITE_ASSETS_PATH / "app.js")
    shutil.copy2(template_root / "assets" / "tooltipStyle.css", SITE_ASSETS_PATH / "tooltipStyle.css")


def write_site_bundles(chapters: list[Chapter], sections: list[Section], glossary_entries: list[GlossaryEntry], section_rules: dict[str, list[RuleEntry]], rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], glossary_variants: list[GlossaryVariant], children_map: dict[str, list[str]], effective_date: str) -> None:
    SITE_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    SITE_DATA_PATH.mkdir(parents=True, exist_ok=True)
    SITE_CONTENT_PATH.mkdir(parents=True, exist_ok=True)
    section_lookup = {section.number: section for section in sections}

    for section in sections:
        write_site_section_bundle(section, section_rules[section.number], rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, children_map)
    for entry in glossary_entries:
        write_site_glossary_bundle(entry, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants)

    write_json(SITE_DATA_PATH / "navigation.json", build_navigation_bundle(chapters, sections, glossary_entries, effective_date))
    write_json(SITE_DATA_PATH / "search-index.json", build_search_index_bundle(section_rules, sections, glossary_entries))
    write_json(SITE_DATA_PATH / "tooltip-previews.json", build_preview_bundle(section_rules, section_lookup, glossary_entries, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, children_map))
    write_site_shell()


def write_markdown_outputs(chapters: list[Chapter], sections: list[Section], glossary_entries: list[GlossaryEntry], glossary_aliases: dict[str, GlossaryEntry], rule_lookup: dict[str, tuple[Section, str]], chapter_lookup: dict[str, Chapter], glossary_lookup: dict[str, GlossaryEntry], effective_date: str) -> None:
    for section in sections:
        write_section_markdown(section, rule_lookup, chapter_lookup, glossary_lookup, effective_date)
    for entry in glossary_entries:
        write_glossary_entry_markdown(entry, rule_lookup, chapter_lookup, glossary_lookup, effective_date)
    write_glossary_alias_markdown(glossary_aliases)
    write_markdown_root_index(chapters, sections, effective_date)
    write_markdown_chapter_indexes(chapters, sections)
    write_markdown_glossary_indexes(glossary_entries)


def clean_outputs() -> None:
    if MARKDOWN_OUTPUT_PATH.exists():
        shutil.rmtree(MARKDOWN_OUTPUT_PATH)
    if SITE_OUTPUT_PATH.exists():
        shutil.rmtree(SITE_OUTPUT_PATH)
    MARKDOWN_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    SITE_OUTPUT_PATH.mkdir(parents=True, exist_ok=True)


def parse_rules() -> None:
    source_document = ensure_latest_rules_downloaded()
    lines = source_document.path.read_text(encoding="utf-8").splitlines()
    rules_start_index = find_rules_body_start(lines)
    rules_end_index = find_rules_body_end(lines, rules_start_index)
    glossary_start_index = find_glossary_start(lines)

    clean_outputs()

    chapters, sections = parse_sections(lines, rules_start_index, rules_end_index)
    glossary_entries = parse_glossary(lines, glossary_start_index)
    section_rules = {section.number: parse_section_rules(section) for section in sections}
    children_map = build_rule_children_map(section_rules)
    rule_lookup = build_rule_lookup(sections, section_rules)
    glossary_lookup = build_glossary_lookup(glossary_entries)
    glossary_aliases = build_glossary_aliases(glossary_entries)
    glossary_variants = build_glossary_variants(glossary_entries)
    chapter_lookup = {chapter.number: chapter for chapter in chapters}

    write_markdown_outputs(chapters, sections, glossary_entries, glossary_aliases, rule_lookup, chapter_lookup, glossary_lookup, source_document.effective_date)
    write_site_bundles(chapters, sections, glossary_entries, section_rules, rule_lookup, chapter_lookup, glossary_lookup, glossary_variants, children_map, source_document.effective_date)


if __name__ == "__main__":
    parse_rules()