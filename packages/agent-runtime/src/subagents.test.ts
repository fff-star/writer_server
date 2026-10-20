import { describe, expect, it } from "vitest";
import { SubagentOrchestrator } from "./subagents.js";

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("SubagentOrchestrator", () => {
  it("runs read-only tasks with bounded concurrency and progress events", async () => {
    let active = 0;
    let maxActive = 0;
    const orchestrator = new SubagentOrchestrator({ maxConcurrency: 2, timeoutMs: 1000 });
    const tasks = [0, 1, 2].map((index) => ({
      role: "web-research" as const,
      input: index,
      readOnly: true,
      run: async (context: { step: (message?: string) => void }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        context.step(`task ${index}`);
        await sleep(20);
        active -= 1;
        return index * 2;
      },
    }));

    const results = await orchestrator.runAll(tasks);
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.status)).toEqual(["completed", "completed", "completed"]);
    expect(results.map((result) => result.output)).toEqual([0, 2, 4]);
    expect(results[0]?.events.some((event) => event.type === "progress")).toBe(true);
  });

  it("enforces read-only, step, and timeout limits independently", async () => {
    const orchestrator = new SubagentOrchestrator({ maxConcurrency: 1, maxSteps: 1, timeoutMs: 5 });
    const [writeTask, stepTask, timeoutTask] = await orchestrator.runAll([
      {
        role: "synthesis",
        input: null,
        readOnly: false,
        run: async () => "not allowed",
      },
      {
        role: "local-research",
        input: null,
        readOnly: true,
        run: async (context) => {
          context.step();
          context.step();
          return "unreachable";
        },
      },
      {
        role: "budget-analysis",
        input: null,
        readOnly: true,
        run: async () => {
          await sleep(20);
          return "late";
        },
      },
    ]);

    expect(writeTask?.status).toBe("failed");
    expect(writeTask?.error).toContain("policy broker");
    expect(stepTask?.status).toBe("cancelled");
    expect(timeoutTask?.status).toBe("cancelled");
  });

  it("runs write-capable tasks when a policy broker is provided", async () => {
    const orchestrator = new SubagentOrchestrator({ policyBroker: {} });
    const [result] = await orchestrator.runAll([
      {
        role: "workspace-edit",
        input: null,
        readOnly: false,
        run: async () => "edited",
      },
    ]);

    expect(result?.status).toBe("completed");
    expect(result?.output).toBe("edited");
  });

  it("rejects write-capable tasks when the broker is absent or null", async () => {
    const task = {
      role: "workspace-edit" as const,
      input: null,
      readOnly: false,
      run: async () => "unreachable",
    };
    const [absent] = await new SubagentOrchestrator().runAll([task]);
    const [nullBroker] = await new SubagentOrchestrator({ policyBroker: null }).runAll([task]);

    expect(absent?.status).toBe("failed");
    expect(absent?.error).toContain("policy broker");
    expect(nullBroker?.status).toBe("failed");
    expect(nullBroker?.error).toContain("policy broker");
  });
});
