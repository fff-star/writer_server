import { readFile } from "node:fs/promises";
import JSZip from "jszip";

function decodeXml(value: string): string {
  return value.replace(/&(#x?\d+|amp|lt|gt|quot|apos);/g, (entity) => {
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&#39;": "'",
      "&#34;": '"',
    };
    return entities[entity] ?? entity;
  });
}

export async function extractDocxText(path: string): Promise<string> {
  const zip = await JSZip.loadAsync(await readFile(path));
  const document = zip.file("word/document.xml");
  if (!document) {
    throw new Error(`DOCX document body is missing: ${path}`);
  }
  const xml = await document.async("string");
  const parts = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) =>
    decodeXml(match[1] ?? ""),
  );
  return parts.join("\n");
}
