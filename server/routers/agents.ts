import type { Express, Request, Response } from "express";
import {
  cancelAgentTask,
  describeLevel,
  enqueueAgentTask,
  getAgentTask,
  getOpenClawClient,
  getPermissionLevel,
  isSimulationMode,
  listAgentTasks,
  listTemplates,
} from "../agents/index.ts";

function bad(res: Response, msg: string, status = 400): void {
  res.status(status).json({ error: msg });
}

export function registerAgentRoutes(app: Express): void {
  app.get("/api/agents/templates", (_req: Request, res: Response) => {
    res.json({
      templates: listTemplates(),
      simulationMode: isSimulationMode(),
      permissionLevel: getPermissionLevel(),
      permissionLabel: describeLevel(),
    });
  });

  app.get("/api/agents/tasks", (_req: Request, res: Response) => {
    res.json({ tasks: listAgentTasks() });
  });

  app.get("/api/agents/health", (_req: Request, res: Response) => {
    const tasks = listAgentTasks();
    const active = tasks.filter((task) => task.status === "awaiting_approval" || task.status === "pending" || task.status === "running");
    res.json({
      openclaw: getOpenClawClient().getStatus(),
      permissionLevel: getPermissionLevel(),
      permissionLabel: describeLevel(),
      queue: {
        total: tasks.length,
        active: active.length,
        completed: tasks.filter((task) => task.status === "completed").length,
        failed: tasks.filter((task) => task.status === "failed").length,
      },
    });
  });

  app.get("/api/agents/tasks/:id", (req: Request, res: Response) => {
    const task = getAgentTask(req.params.id);
    if (!task) {
      bad(res, "task not found", 404);
      return;
    }
    res.json(task);
  });

  app.post("/api/agents/tasks", (req: Request, res: Response) => {
    const body = req.body as { templateId?: unknown; target?: unknown; inputs?: unknown };
    if (typeof body?.templateId !== "string" || typeof body?.target !== "string") {
      bad(res, "templateId and target are required strings");
      return;
    }
    const inputs: Record<string, string> = {};
    if (body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)) {
      for (const [key, value] of Object.entries(body.inputs as Record<string, unknown>)) {
        if (typeof value === "string") inputs[key] = value;
      }
    }
    try {
      const task = enqueueAgentTask({ templateId: body.templateId, target: body.target, inputs });
      res.status(201).json(task);
    } catch (err) {
      bad(res, err instanceof Error ? err.message : "failed_to_enqueue");
    }
  });

  app.delete("/api/agents/tasks/:id", (req: Request, res: Response) => {
    const task = cancelAgentTask(req.params.id);
    if (!task) {
      bad(res, "task not found", 404);
      return;
    }
    res.json(task);
  });
}
