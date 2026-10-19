import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type SubagentRole = "local-research" | "web-research" | "budget-analysis" | "synthesis";
export type SubagentEvent = {
  type: "queued" | "started" | "progress" | "completed" | "failed" | "cancelled";
  taskId: string;
  role: SubagentRole;
  message?: string;
};
export type SubagentContext<Input> = {
  input: Input;
  signal: AbortSignal;
  step: (message?: string) => void;
  report: (message: string) => void;
};
export type SubagentTask<Input, Output> = {
  id?: string;
  role: SubagentRole;
  input: Input;
  readOnly: boolean;
  run: (context: SubagentContext<Input>) => Promise<Output>;
};
export type SubagentResult<Output> = {
  taskId: string;
  role: SubagentRole;
  status: "completed" | "failed" | "cancelled";
  output?: Output;
  error?: string;
  durationMs: number;
  steps: number;
  events: SubagentEvent[];
};
export type SubagentOrchestratorOptions = {
  maxConcurrency?: number;
  timeoutMs?: number;
  maxSteps?: number;
};

export class SubagentOrchestrator {
  private readonly maxConcurrency: number;
  private readonly timeoutMs: number;
  private readonly maxSteps: number;

  constructor(options: SubagentOrchestratorOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 3;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxSteps = options.maxSteps ?? 20;
    if (this.maxConcurrency < 1 || this.timeoutMs < 1 || this.maxSteps < 1) {
      throw new Error("Subagent limits must be positive");
    }
  }

  async runAll<Input, Output>(
    tasks: Array<SubagentTask<Input, Output>>,
  ): Promise<Array<SubagentResult<Output>>> {
    const queue = [...tasks];
    const results: Array<SubagentResult<Output>> = [];
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(this.maxConcurrency, queue.length) },
      async () => {
        while (nextIndex < queue.length) {
          const task = queue[nextIndex]!;
          nextIndex += 1;
          results.push(await this.runTask(task));
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  private async runTask<Input, Output>(
    task: SubagentTask<Input, Output>,
  ): Promise<SubagentResult<Output>> {
    const taskId = task.id ?? randomUUID();
    const events: SubagentEvent[] = [{ type: "queued", taskId, role: task.role }];
    const controller = new AbortController();
    const started = performance.now();
    let steps = 0;
    const emit = (event: SubagentEvent) => {
      events.push(event);
    };
    const context: SubagentContext<Input> = {
      input: task.input,
      signal: controller.signal,
      step: (message) => {
        steps += 1;
        if (steps > this.maxSteps) {
          controller.abort(new Error(`Subagent exceeded ${this.maxSteps} steps`));
          throw new Error(`Subagent exceeded ${this.maxSteps} steps`);
        }
        emit({ type: "progress", taskId, role: task.role, ...(message ? { message } : {}) });
      },
      report: (message) => {
        emit({ type: "progress", taskId, role: task.role, message });
      },
    };
    emit({ type: "started", taskId, role: task.role });
    const timeout = setTimeout(
      () => controller.abort(new Error("Subagent timed out")),
      this.timeoutMs,
    );
    try {
      if (!task.readOnly) {
        throw new Error("Subagents must use read-only tasks in this milestone");
      }
      const output = await task.run(context);
      if (controller.signal.aborted) {
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new Error("Subagent cancelled");
      }
      emit({ type: "completed", taskId, role: task.role });
      return {
        taskId,
        role: task.role,
        status: "completed",
        output,
        durationMs: Math.round(performance.now() - started),
        steps,
        events,
      };
    } catch (error) {
      const cancelled = controller.signal.aborted;
      emit({ type: cancelled ? "cancelled" : "failed", taskId, role: task.role });
      return {
        taskId,
        role: task.role,
        status: cancelled ? "cancelled" : "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - started),
        steps,
        events,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
