import type { DocumentBlock, OfficeDocument } from "./model.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function renderBlock(block: DocumentBlock): string {
  switch (block.type) {
    case "heading":
      return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
    case "paragraph":
      return `<p>${escapeHtml(block.text)}</p>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
    }
    case "table":
      return `<table><thead><tr>${block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    case "citation":
      return `<p class="citation">${escapeHtml(block.text)}<br><small>${escapeHtml(block.source.label)} — ${escapeHtml(block.source.locator)}</small></p>`;
  }
}

export function renderDocumentHtml(document: OfficeDocument): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(document.title)}</title><style>@page{size:A4;margin:22mm 20mm}body{margin:0;color:#17231d;font-family:'Noto Serif CJK SC','SimSun',serif;font-size:12pt;line-height:1.75}h1{font-size:22pt}h2{font-size:17pt}h3{font-size:14pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid #777;padding:6px;text-align:left}.citation{color:#44564b;font-size:10pt}</style></head><body>${document.blocks.map(renderBlock).join("")}</body></html>`;
}
