import { describe, expect, it } from "vitest";
import { renderDocumentHtml } from "./html.js";
import type { OfficeDocument } from "./model.js";

describe("renderDocumentHtml", () => {
  it("escapes source text and restricts embedded content", () => {
    const document: OfficeDocument = {
      schemaVersion: 1,
      title: "Test",
      style: "standard",
      blocks: [{ type: "paragraph", id: "p", text: "<script>alert(1)</script>" }],
    };
    const html = renderDocumentHtml(document);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
  });
});
