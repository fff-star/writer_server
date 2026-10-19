import { describe, expect, it } from "vitest";
import { mergeAgentRevision } from "./model.js";
import type { OfficeDocument } from "./model.js";

const base: OfficeDocument = {
  schemaVersion: 1,
  title: "Draft",
  style: "standard",
  blocks: [
    { type: "heading", id: "title", level: 1, text: "Original" },
    { type: "paragraph", id: "summary", text: "Base summary" },
  ],
};

describe("mergeAgentRevision", () => {
  it("preserves manual edits and reports conflicts", () => {
    const current: OfficeDocument = {
      ...base,
      blocks: [base.blocks[0]!, { type: "paragraph", id: "summary", text: "Human summary" }],
    };
    const agent: OfficeDocument = {
      ...base,
      blocks: [
        { type: "heading", id: "title", level: 1, text: "Agent title" },
        { type: "paragraph", id: "summary", text: "Agent summary" },
      ],
    };
    const result = mergeAgentRevision(base, current, agent);
    expect(result.document.blocks).toContainEqual({
      type: "heading",
      id: "title",
      level: 1,
      text: "Agent title",
    });
    expect(result.document.blocks).toContainEqual({
      type: "paragraph",
      id: "summary",
      text: "Human summary",
    });
    expect(result.conflicts).toEqual(["summary"]);
  });
});
