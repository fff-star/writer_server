import { z } from "zod";

const heading = z.object({
  type: z.literal("heading"),
  id: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
});
const paragraph = z.object({
  type: z.literal("paragraph"),
  id: z.string().min(1),
  text: z.string(),
});
const list = z.object({
  type: z.literal("list"),
  id: z.string().min(1),
  ordered: z.boolean(),
  items: z.array(z.string()),
});
const table = z.object({
  type: z.literal("table"),
  id: z.string().min(1),
  header: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});
const citation = z.object({
  type: z.literal("citation"),
  id: z.string().min(1),
  text: z.string(),
  source: z.object({
    label: z.string().min(1),
    locator: z.string().min(1),
    kind: z.enum(["local", "web"]),
  }),
});

export const documentBlockSchema = z.discriminatedUnion("type", [
  heading,
  paragraph,
  list,
  table,
  citation,
]);
export const officeDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  style: z.literal("standard"),
  blocks: z.array(documentBlockSchema),
});

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type OfficeDocument = z.infer<typeof officeDocumentSchema>;

export type MergeResult = {
  document: OfficeDocument;
  conflicts: string[];
};

function sameBlock(left: DocumentBlock | undefined, right: DocumentBlock | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeAgentRevision(
  base: OfficeDocument,
  current: OfficeDocument,
  agent: OfficeDocument,
): MergeResult {
  const baseBlocks = new Map(base.blocks.map((block) => [block.id, block]));
  const currentBlocks = new Map(current.blocks.map((block) => [block.id, block]));
  const agentBlocks = new Map(agent.blocks.map((block) => [block.id, block]));
  const ids = new Set([...baseBlocks.keys(), ...currentBlocks.keys(), ...agentBlocks.keys()]);
  const blocks: DocumentBlock[] = [];
  const conflicts: string[] = [];

  for (const id of ids) {
    const baseBlock = baseBlocks.get(id);
    const currentBlock = currentBlocks.get(id);
    const agentBlock = agentBlocks.get(id);
    const manuallyChanged = !sameBlock(currentBlock, baseBlock);

    if (manuallyChanged && !sameBlock(agentBlock, baseBlock)) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      conflicts.push(id);
    } else if (agentBlock) {
      blocks.push(agentBlock);
    } else if (currentBlock && manuallyChanged) {
      blocks.push(currentBlock);
    }
  }

  return {
    document: officeDocumentSchema.parse({
      ...agent,
      title: current.title !== base.title ? current.title : agent.title,
      blocks,
    }),
    conflicts,
  };
}
