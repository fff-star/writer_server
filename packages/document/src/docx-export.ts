import {
  AlignmentType,
  Document as DocxDocument,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { DocumentBlock, OfficeDocument } from "./model.js";

function text(value: string, options: { bold?: boolean; italics?: boolean } = {}): TextRun {
  return new TextRun({
    text: value,
    ...(options.bold === undefined ? {} : { bold: options.bold }),
    ...(options.italics === undefined ? {} : { italics: options.italics }),
    font: {
      ascii: "Arial",
      eastAsia: "Microsoft YaHei",
    },
  });
}

function cell(value: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [text(value, { bold })] })],
  });
}

function exportBlock(block: DocumentBlock): Array<Paragraph | Table> {
  switch (block.type) {
    case "heading": {
      const levels = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      } as const;
      return [new Paragraph({ heading: levels[block.level], children: [text(block.text)] })];
    }
    case "paragraph":
      return [new Paragraph({ children: [text(block.text)] })];
    case "list":
      return block.items.map(
        (item) =>
          new Paragraph({
            children: [text(item)],
            ...(block.ordered
              ? { numbering: { reference: "ordered-list", level: 0 } }
              : { bullet: { level: 0 } }),
          }),
      );
    case "table":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: block.header.map((value) => cell(value, true)) }),
            ...block.rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
          ],
        }),
      ];
    case "citation":
      return [
        new Paragraph({
          children: [
            text(`${block.text}\n${block.source.label} — ${block.source.locator}`, {
              italics: true,
            }),
          ],
        }),
      ];
  }
}

export async function exportDocx(document: OfficeDocument): Promise<Buffer> {
  const docx = new DocxDocument({
    styles: {
      default: {
        document: {
          run: { size: 24 },
          paragraph: { spacing: { after: 120, line: 360 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: "ordered-list",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1247, right: 1134, bottom: 1247, left: 1134 },
          },
        },
        children: document.blocks.flatMap(exportBlock),
      },
    ],
  });
  return Packer.toBuffer(docx);
}
