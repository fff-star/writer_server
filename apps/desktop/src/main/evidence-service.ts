import { join } from "node:path";
import type { BudgetReport } from "@office-agent/contracts";
import { aggregateBudget } from "@office-agent/analysis";
import {
  SubagentOrchestrator,
  type SubagentEvent,
  type SubagentTask,
} from "@office-agent/agent-runtime";
import type { StoredBlock } from "@office-agent/library";
import {
  BraveSearchProvider,
  HttpFetchProvider,
  ResearchService,
  WebCache,
  type ResearchCollection,
} from "@office-agent/research";
import type { LibraryService } from "./library-service";

export type WebEvidence =
  { available: true; collection: ResearchCollection } | { available: false; reason: string };

export type BudgetEvidenceReport = {
  budget: BudgetReport;
  web: WebEvidence;
  subagents: SubagentEvent[];
};

type ResearchResources = {
  service: ResearchService;
  close: () => void;
};

export class EvidenceService {
  private constructor(
    private readonly library: LibraryService,
    private readonly research: ResearchResources | null,
  ) {}

  static async create(library: LibraryService, userDataRoot: string): Promise<EvidenceService> {
    const apiKey = process.env["BRAVE_SEARCH_API_KEY"];
    if (!apiKey) {
      return new EvidenceService(library, null);
    }
    const cache = await WebCache.open(join(userDataRoot, "research", "web-cache.db"));
    return new EvidenceService(library, {
      service: new ResearchService(new BraveSearchProvider(apiKey), new HttpFetchProvider(), cache),
      close: () => cache.close(),
    });
  }

  async analyzeBudget(query: string): Promise<BudgetEvidenceReport> {
    const blocks = this.library.blocks();
    const orchestrator = new SubagentOrchestrator({
      maxConcurrency: 2,
      timeoutMs: 30_000,
      maxSteps: 8,
    });
    const tasks: SubagentTask<StoredBlock[] | string, BudgetReport | WebEvidence>[] = [
      {
        role: "budget-analysis",
        input: blocks,
        readOnly: true,
        run: async (context) => {
          context.step("Aggregating quarterly totals");
          return aggregateBudget(context.input as StoredBlock[]);
        },
      },
      {
        role: "web-research",
        input: query,
        readOnly: true,
        run: async (context): Promise<WebEvidence> => {
          context.step("Checking research provider");
          if (!this.research) {
            return {
              available: false,
              reason: "BRAVE_SEARCH_API_KEY is not configured",
            };
          }
          context.step("Collecting public web sources");
          return {
            available: true,
            collection: await this.research.service.collect(context.input as string, 3),
          };
        },
      },
    ];
    const results = await orchestrator.runAll(tasks);
    const budgetResult = results.find((result) => result.role === "budget-analysis");
    const webResult = results.find((result) => result.role === "web-research");
    if (budgetResult?.status !== "completed" || !budgetResult.output) {
      throw new Error(budgetResult?.error ?? "Budget analysis failed");
    }
    if (webResult?.status !== "completed" || !webResult.output) {
      throw new Error(webResult?.error ?? "Web research failed");
    }
    return {
      budget: budgetResult.output as BudgetReport,
      web: webResult.output as WebEvidence,
      subagents: results.flatMap((result) => result.events),
    };
  }

  close(): void {
    this.research?.close();
  }
}
