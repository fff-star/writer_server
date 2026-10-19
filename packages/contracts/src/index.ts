import { z } from "zod";

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(["linux", "win32", "darwin"]),
  stage: z.literal("foundation"),
});

export type AppInfo = z.infer<typeof appInfoSchema>;

export const sourceLocatorSchema = z.object({
  kind: z.enum(["file", "block", "page", "cell", "row", "line", "region"]),
  block: z.string().optional(),
  page: z.number().int().positive().optional(),
  sheet: z.string().optional(),
  cell: z.string().optional(),
  row: z.number().int().positive().optional(),
  line: z.number().int().positive().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export type SourceLocator = z.infer<typeof sourceLocatorSchema>;

export const extractedBlockSchema = z.object({
  kind: z.enum(["heading", "paragraph", "table-cell", "table-row", "text", "image", "metadata"]),
  text: z.string(),
  locator: sourceLocatorSchema,
});

export type ExtractedBlock = z.infer<typeof extractedBlockSchema>;

export const extractionStatusSchema = z.enum([
  "imported",
  "processing",
  "indexed",
  "partial",
  "failed",
]);
export type ExtractionStatus = z.infer<typeof extractionStatusSchema>;

export const librarySnapshotSummarySchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mediaType: z.string(),
  extension: z.string(),
  size: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  status: extractionStatusSchema,
  error: z.string().nullable(),
  importedAt: z.string(),
});
export type LibrarySnapshotSummary = z.infer<typeof librarySnapshotSummarySchema>;

export const libraryImportSummarySchema = z.object({
  imported: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  snapshots: z.array(librarySnapshotSummarySchema),
});
export type LibraryImportSummary = z.infer<typeof libraryImportSummarySchema>;

export const librarySearchResultSchema = z.object({
  snapshotId: z.string(),
  snapshotName: z.string(),
  blockIndex: z.number().int().nonnegative(),
  kind: z.string(),
  text: z.string(),
  locator: sourceLocatorSchema,
  score: z.number(),
});
export type LibrarySearchResult = z.infer<typeof librarySearchResultSchema>;

export type EmbeddingProvider = {
  id: string;
  dimensions: number;
  embed: (texts: string[]) => Promise<number[][]>;
};

export const budgetEvidenceSchema = z.object({
  snapshotId: z.string(),
  quarter: z.string(),
  amountCents: z.string(),
  text: z.string(),
  locator: sourceLocatorSchema,
});
export type BudgetEvidence = z.infer<typeof budgetEvidenceSchema>;

export const budgetQuarterSchema = z.object({
  quarter: z.string(),
  totalCents: z.string(),
  calculation: z.string(),
  evidence: z.array(budgetEvidenceSchema),
});
export type BudgetQuarter = z.infer<typeof budgetQuarterSchema>;

export const budgetAnomalySchema = z.object({
  kind: z.enum(["increase", "decrease", "negative"]),
  quarter: z.string(),
  message: z.string(),
  changeRatio: z.number().optional(),
  evidence: z.array(budgetEvidenceSchema),
});
export type BudgetAnomaly = z.infer<typeof budgetAnomalySchema>;

export const budgetReportSchema = z.object({
  quarters: z.array(budgetQuarterSchema),
  anomalies: z.array(budgetAnomalySchema),
});
export type BudgetReport = z.infer<typeof budgetReportSchema>;

export const webSearchResultSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  snippet: z.string(),
  publishedAt: z.string().optional(),
});
export type WebSearchResult = z.infer<typeof webSearchResultSchema>;

export const webSourceSchema = z.object({
  url: z.url(),
  title: z.string(),
  text: z.string(),
  sha256: z.string().length(64),
  fetchedAt: z.string(),
});
export type WebSource = z.infer<typeof webSourceSchema>;

export const researchBundleSchema = z.object({
  query: z.string(),
  results: z.array(webSearchResultSchema),
  sources: z.array(webSourceSchema),
});
export type ResearchBundle = z.infer<typeof researchBundleSchema>;
