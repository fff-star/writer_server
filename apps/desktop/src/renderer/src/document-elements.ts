import type { IElement } from "@hufe921/canvas-editor";
import type { DocumentBlock, OfficeDocument } from "@office-agent/document";

/**
 * Mapping between the canonical office document model and the flat element
 * stream of @hufe921/canvas-editor.
 *
 * Block identity and metadata that the editor cannot express travel in the
 * `extension` field, which canvas-editor preserves per element through
 * editing and `getValue()` serialization. Citation locator data is restored
 * from the previously loaded document (never from the editor), with a copy
 * embedded in the extension as a fallback. Tables record their original
 * header/row lengths so padded cells do not leak back into the model.
 */

type ElementTypeValue = NonNullable<IElement["type"]>;
type TitleLevelValue = NonNullable<IElement["level"]>;
type ListTypeValue = NonNullable<IElement["listType"]>;
type ListStyleValue = NonNullable<IElement["listStyle"]>;

const TITLE_ELEMENT = "title" as ElementTypeValue;
const LIST_ELEMENT = "list" as ElementTypeValue;
const TABLE_ELEMENT = "table" as ElementTypeValue;
const TEXT_ELEMENT = "text" as ElementTypeValue;
const SUBSCRIPT_ELEMENT = "subscript" as ElementTypeValue;
const SUPERSCRIPT_ELEMENT = "superscript" as ElementTypeValue;
const TAB_ELEMENT = "tab" as ElementTypeValue;
const ORDERED_LIST = "ol" as ListTypeValue;
const UNORDERED_LIST = "ul" as ListTypeValue;
const DECIMAL_STYLE = "decimal" as ListStyleValue;
const DISC_STYLE = "disc" as ListStyleValue;

const TITLE_LEVEL_BY_MODEL: Record<1 | 2 | 3, TitleLevelValue> = {
  1: "first" as TitleLevelValue,
  2: "second" as TitleLevelValue,
  3: "third" as TitleLevelValue,
};
const MODEL_LEVEL_BY_TITLE: Record<string, 1 | 2 | 3> = {
  first: 1,
  second: 2,
  third: 3,
};

type CitationSource = Extract<DocumentBlock, { type: "citation" }>["source"];

export type BlockExtension = {
  block: string;
  kind: DocumentBlock["type"];
  citation?: CitationSource;
  headerLength?: number;
  rowLengths?: number[];
};

type Line = {
  text: string;
  marker: IElement | null;
  members: IElement[];
};

let generatedCounter = 0;
function newBlockId(): string {
  generatedCounter += 1;
  return `c${Date.now().toString(36)}-${generatedCounter}`;
}

function readExtension(value: unknown): BlockExtension | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate["block"] !== "string" || typeof candidate["kind"] !== "string") {
    return null;
  }
  const extension: BlockExtension = {
    block: candidate["block"],
    kind: candidate["kind"] as DocumentBlock["type"],
  };
  const citation = candidate["citation"];
  if (citation && typeof citation === "object") {
    const source = citation as Record<string, unknown>;
    if (
      typeof source["label"] === "string" &&
      typeof source["locator"] === "string" &&
      (source["kind"] === "local" || source["kind"] === "web")
    ) {
      extension.citation = {
        label: source["label"],
        locator: source["locator"],
        kind: source["kind"],
      };
    }
  }
  if (typeof candidate["headerLength"] === "number") {
    extension.headerLength = candidate["headerLength"];
  }
  if (
    Array.isArray(candidate["rowLengths"]) &&
    candidate["rowLengths"].every((length) => typeof length === "number")
  ) {
    extension.rowLengths = candidate["rowLengths"] as number[];
  }
  return extension;
}

function lineExtension(line: Line): BlockExtension | null {
  const fromMarker = line.marker ? readExtension(line.marker.extension) : null;
  if (fromMarker) {
    return fromMarker;
  }
  for (const member of line.members) {
    const extension = readExtension(member.extension);
    if (extension) {
      return extension;
    }
  }
  return null;
}

function isTextLike(element: IElement): boolean {
  return (
    !element.type ||
    element.type === TEXT_ELEMENT ||
    element.type === SUBSCRIPT_ELEMENT ||
    element.type === SUPERSCRIPT_ELEMENT ||
    element.type === TAB_ELEMENT
  );
}

function appendValue(lines: Line[], element: IElement, value: string): void {
  const segments = value.split("\n");
  for (let index = 0; index < segments.length; index += 1) {
    if (index > 0) {
      lines.push({ text: "", marker: element, members: [] });
    }
    const part = segments[index];
    if (part) {
      const current = lines[lines.length - 1]!;
      current.text += part;
      current.members.push(element);
      if (!current.marker) {
        current.marker = element;
      }
    }
  }
}

function splitLines(elements: IElement[]): Line[] {
  const lines: Line[] = [{ text: "", marker: null, members: [] }];
  for (const element of elements) {
    if (isTextLike(element)) {
      appendValue(lines, element, element.value);
    } else if (Array.isArray(element.valueList)) {
      const inline = splitLines(element.valueList)
        .filter((line) => !isArtifactLine(line))
        .map((line) => line.text)
        .join("");
      if (inline) {
        appendValue(lines, element, inline);
      }
    }
    // Elements the model cannot represent (images, separators, page breaks,
    // controls) are skipped; they never originate from a document block.
  }
  return lines;
}

function isArtifactLine(line: Line): boolean {
  // Lines that carry no text and no block identity are paragraph-boundary
  // artifacts (e.g. the editor's own compensation marker at document start).
  return (
    line.text === "" &&
    line.members.length === 0 &&
    (!line.marker || !readExtension(line.marker.extension))
  );
}

function contentLines(elements: IElement[]): Line[] {
  return splitLines(elements).filter((line) => !isArtifactLine(line));
}

function tableColumns(block: Extract<DocumentBlock, { type: "table" }>): number {
  return Math.max(block.header.length, ...block.rows.map((row) => row.length), 0);
}

function isRenderable(block: DocumentBlock): boolean {
  if (block.type === "list") {
    return block.items.length > 0;
  }
  if (block.type === "table") {
    return tableColumns(block) > 0;
  }
  return true;
}

function textRuns(text: string, extension: BlockExtension): IElement[] {
  const runs: IElement[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) {
      runs.push({ value: "\n", extension });
    }
    const line = lines[index]!;
    if (line) {
      runs.push({ value: line, extension });
    }
  }
  if (runs.length === 0) {
    // An empty line is represented by its paragraph-start marker alone so the
    // block (and its extension metadata) survives the editor round-trip.
    runs.push({ value: "\n", extension });
  }
  return runs;
}

// Every top-level paragraph line starts with a "\n" marker carrying the
// block extension: in canvas-editor's flat model the marker opens the
// paragraph, and keeping the extension on it preserves block identity even
// when the user deletes all of the paragraph's text.
function blockRuns(text: string, extension: BlockExtension): IElement[] {
  const runs: IElement[] = [];
  for (const line of text.split("\n")) {
    runs.push({ value: "\n", extension });
    if (line) {
      runs.push({ value: line, extension });
    }
  }
  return runs;
}

function padCells(cells: string[], columns: number): string[] {
  if (cells.length >= columns) {
    return cells;
  }
  return [...cells, ...Array.from({ length: columns - cells.length }, () => "")];
}

export function blocksToElements(document: OfficeDocument): IElement[] {
  const elements: IElement[] = [];
  for (const block of document.blocks) {
    if (!isRenderable(block)) {
      // Empty lists and column-less tables have no canvas representation;
      // elementsToBlocks re-inserts them from the previous document.
      continue;
    }
    const extension: BlockExtension = { block: block.id, kind: block.type };
    switch (block.type) {
      case "heading":
        elements.push({
          type: TITLE_ELEMENT,
          value: "",
          level: TITLE_LEVEL_BY_MODEL[block.level],
          titleId: block.id,
          valueList: blockRuns(block.text, extension),
        });
        break;
      case "paragraph":
        elements.push(...blockRuns(block.text, extension));
        break;
      case "list": {
        const valueList: IElement[] = [];
        for (const item of block.items) {
          const lines = item.split("\n");
          for (let index = 0; index < lines.length; index += 1) {
            const marker: IElement = { value: "\n", extension, listId: block.id };
            if (index > 0) {
              marker.listWrap = true;
            }
            valueList.push(marker);
            const line = lines[index]!;
            if (line) {
              valueList.push({ value: line, extension, listId: block.id });
            }
          }
        }
        elements.push({
          type: LIST_ELEMENT,
          value: "",
          listType: block.ordered ? ORDERED_LIST : UNORDERED_LIST,
          listStyle: block.ordered ? DECIMAL_STYLE : DISC_STYLE,
          listId: block.id,
          valueList,
        });
        break;
      }
      case "table": {
        const columns = tableColumns(block);
        const tableExtension: BlockExtension = {
          ...extension,
          headerLength: block.header.length,
          rowLengths: block.rows.map((row) => row.length),
        };
        const rows = [block.header, ...block.rows];
        elements.push({
          type: TABLE_ELEMENT,
          value: "",
          id: block.id,
          extension: tableExtension,
          trList: rows.map((cells) => ({
            height: 36,
            extension: tableExtension,
            tdList: padCells(cells, columns).map((cell) => ({
              colspan: 1,
              rowspan: 1,
              extension: tableExtension,
              value: textRuns(cell, tableExtension),
            })),
          })),
        });
        break;
      }
      case "citation":
        elements.push(...blockRuns(block.text, { ...extension, citation: block.source }));
        break;
    }
  }
  return elements.length > 0 ? elements : [{ value: "\n" }];
}

function trimRow(cells: string[], recordedLength: number | undefined): string[] {
  if (recordedLength === undefined || cells.length <= recordedLength) {
    return cells;
  }
  const overflow = cells.slice(recordedLength);
  if (overflow.every((cell) => cell === "")) {
    return cells.slice(0, recordedLength);
  }
  return cells;
}

function parseTable(element: IElement, extension: BlockExtension | null): DocumentBlock {
  const grid = (element.trList ?? []).map((row) =>
    row.tdList.map((cell) =>
      contentLines(cell.value ?? [])
        .map((line) => line.text)
        .join("\n"),
    ),
  );
  let header: string[];
  let rows: string[][];
  if (extension && typeof extension.headerLength === "number") {
    if (extension.headerLength === 0) {
      // A header-less table was rendered with a synthetic empty first row;
      // drop it unless the user typed into it.
      header = [];
      const [first, ...rest] = grid;
      rows = rest.map((cells, index) => trimRow(cells, extension.rowLengths?.[index]));
      if (first && first.some((cell) => cell !== "")) {
        rows.unshift(first);
      }
    } else {
      header = trimRow(grid[0] ?? [], extension.headerLength);
      rows = grid.slice(1).map((cells, index) => trimRow(cells, extension.rowLengths?.[index]));
    }
  } else {
    header = grid[0] ?? [];
    rows = grid.slice(1);
  }
  return {
    type: "table",
    id: extension?.block ?? newBlockId(),
    header,
    rows,
  };
}

type ParsedLine = {
  kind: "heading" | "list-item" | "citation" | "paragraph";
  text: string;
  extension: BlockExtension | null;
  level: 1 | 2 | 3;
  listId: string | null;
  ordered: boolean;
};

function classifyLine(line: Line): ParsedLine {
  const extension = lineExtension(line);
  const carriers = [line.marker, ...line.members].filter(
    (element): element is IElement => element !== null,
  );
  const titled = carriers.find((element) => element.level && element.titleId);
  if (titled) {
    return {
      kind: "heading",
      text: line.text,
      extension,
      level: MODEL_LEVEL_BY_TITLE[titled.level as string] ?? 3,
      listId: null,
      ordered: false,
    };
  }
  const listed = carriers.find((element) => element.listId);
  if (listed) {
    return {
      kind: "list-item",
      text: line.text,
      extension,
      level: 1,
      listId: listed.listId ?? null,
      ordered: listed.listType === ORDERED_LIST,
    };
  }
  if (extension?.kind === "citation") {
    return {
      kind: "citation",
      text: line.text,
      extension,
      level: 1,
      listId: null,
      ordered: false,
    };
  }
  return {
    kind: "paragraph",
    text: line.text,
    extension,
    level: 1,
    listId: null,
    ordered: false,
  };
}

export function elementsToBlocks(elements: IElement[], previous: OfficeDocument): DocumentBlock[] {
  const previousById = new Map(previous.blocks.map((block) => [block.id, block]));
  const usedPrevious = new Set<string>();
  const blocks: DocumentBlock[] = [];
  // Blocks whose id was freshly generated (not matched to a previous block)
  // are eligible for the citation text fallback below.
  const unmatchedParagraphIndexes: number[] = [];

  const resolveId = (extension: BlockExtension | null, fallback: string | null): string => {
    if (extension) {
      return extension.block;
    }
    if (fallback && previousById.has(fallback)) {
      return fallback;
    }
    return fallback ?? newBlockId();
  };

  const pushLineBlock = (line: ParsedLine) => {
    const previousBlock = line.extension ? previousById.get(line.extension.block) : undefined;
    if (previousBlock) {
      usedPrevious.add(previousBlock.id);
    }
    const last = blocks[blocks.length - 1];
    const joinable =
      last &&
      line.kind !== "list-item" &&
      line.extension &&
      last.id === line.extension.block &&
      last.type === line.kind;
    if (joinable && (last.type === "paragraph" || last.type === "heading")) {
      last.text = `${last.text}\n${line.text}`;
      return;
    }
    if (joinable && last.type === "citation") {
      last.text = `${last.text}\n${line.text}`;
      return;
    }
    switch (line.kind) {
      case "heading":
        blocks.push({
          type: "heading",
          id: resolveId(line.extension, null),
          level: line.level,
          text: line.text,
        });
        break;
      case "citation": {
        const source =
          previousBlock?.type === "citation" ? previousBlock.source : line.extension?.citation;
        if (!source) {
          // The locator is unrecoverable: degrade to a paragraph rather than
          // emitting a citation with an empty source.
          blocks.push({ type: "paragraph", id: newBlockId(), text: line.text });
          unmatchedParagraphIndexes.push(blocks.length - 1);
          break;
        }
        blocks.push({
          type: "citation",
          id: resolveId(line.extension, null),
          text: line.text,
          source,
        });
        break;
      }
      case "paragraph": {
        const id = resolveId(line.extension, null);
        blocks.push({ type: "paragraph", id, text: line.text });
        if (!previousById.has(id)) {
          unmatchedParagraphIndexes.push(blocks.length - 1);
        }
        break;
      }
      case "list-item": {
        const key = line.listId ?? line.extension?.block ?? null;
        const lastList = last?.type === "list" ? last : null;
        const lastKey = lastList ? listKeys.get(lastList.id) : undefined;
        if (lastList && lastKey === key && key !== null) {
          lastList.items.push(line.text);
          if (line.extension) {
            usedPrevious.add(line.extension.block);
          }
          break;
        }
        const id = resolveId(line.extension, key);
        blocks.push({ type: "list", id, ordered: line.ordered, items: [line.text] });
        listKeys.set(id, key);
        if (key && previousById.has(key)) {
          usedPrevious.add(key);
        }
        break;
      }
    }
  };

  const listKeys = new Map<string, string | null>();

  const flushRuns = (runs: IElement[]) => {
    if (runs.length === 0) {
      return;
    }
    for (const line of contentLines(runs)) {
      pushLineBlock(classifyLine(line));
    }
  };

  const parseListContainer = (element: IElement) => {
    const ordered = element.listType === ORDERED_LIST;
    for (const line of contentLines(element.valueList ?? [])) {
      if (line.marker?.listWrap) {
        const last = blocks[blocks.length - 1];
        if (last?.type === "list" && last.items.length > 0) {
          last.items[last.items.length - 1] += `\n${line.text}`;
        }
        continue;
      }
      const extension = lineExtension(line);
      pushLineBlock({
        kind: "list-item",
        text: line.text,
        extension,
        level: 1,
        listId: line.marker?.listId ?? extension?.block ?? null,
        ordered,
      });
    }
  };

  let runs: IElement[] = [];
  for (const element of elements) {
    if (element.type === TABLE_ELEMENT) {
      flushRuns(runs);
      runs = [];
      const extension =
        readExtension(element.extension) ??
        (element.trList ?? [])
          .flatMap((row) => row.tdList)
          .map((cell) => readExtension(cell.extension))
          .find((found) => found !== null) ??
        null;
      const block = parseTable(element, extension);
      if (previousById.has(block.id)) {
        usedPrevious.add(block.id);
      }
      blocks.push(block);
    } else if (element.type === TITLE_ELEMENT && Array.isArray(element.valueList)) {
      flushRuns(runs);
      runs = [];
      const lines = contentLines(element.valueList);
      const text = lines.map((line) => line.text).join("\n");
      const extension = lines.map((line) => lineExtension(line)).find((found) => found) ?? null;
      const id = resolveId(extension, element.titleId ?? null);
      if (previousById.has(id)) {
        usedPrevious.add(id);
      }
      blocks.push({
        type: "heading",
        id,
        level: MODEL_LEVEL_BY_TITLE[element.level as string] ?? 3,
        text,
      });
    } else if (element.type === LIST_ELEMENT && Array.isArray(element.valueList)) {
      flushRuns(runs);
      runs = [];
      parseListContainer(element);
    } else {
      runs.push(element);
    }
  }
  flushRuns(runs);

  // Citation fallback: a citation whose extension markers were destroyed but
  // whose text survived verbatim is re-classified instead of degraded.
  const unmatchedCitations = previous.blocks.filter(
    (block) => block.type === "citation" && !usedPrevious.has(block.id),
  );
  for (const citation of unmatchedCitations) {
    if (citation.type !== "citation") {
      continue;
    }
    const candidates = unmatchedParagraphIndexes.filter((index) => {
      const block = blocks[index];
      return block?.type === "paragraph" && block.text === citation.text;
    });
    if (candidates.length === 1) {
      const index = candidates[0]!;
      blocks[index] = {
        type: "citation",
        id: citation.id,
        text: citation.text,
        source: citation.source,
      };
      usedPrevious.add(citation.id);
    }
  }

  // Blocks with no canvas representation cannot be edited or deleted in the
  // editor; re-insert them at their original position so saving never drops
  // them.
  for (let index = 0; index < previous.blocks.length; index += 1) {
    const block = previous.blocks[index]!;
    if (usedPrevious.has(block.id) || isRenderable(block)) {
      continue;
    }
    blocks.splice(Math.min(index, blocks.length), 0, block);
    usedPrevious.add(block.id);
  }

  return blocks;
}
