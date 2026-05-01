export type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AgentTemplateInput = {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

export type AgentTemplateCategory = "pf" | "trading" | "research";

export type AgentTemplate = {
  id: string;
  label: string;
  description: string;
  category: AgentTemplateCategory;
  inputs: AgentTemplateInput[];
};

export type AgentResult = {
  markdown: string;
  wikiPath: string | null;
};

export type AgentTask = {
  id: string;
  templateId: string;
  templateLabel: string;
  target: string;
  inputs: Record<string, string>;
  status: AgentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  result?: AgentResult;
  resultPreview?: string;
};

export type CreateAgentTaskInput = {
  templateId: string;
  target: string;
  inputs?: Record<string, string>;
};

export type AgentNotifier = {
  onStart?: (task: AgentTask) => Promise<void> | void;
  onComplete?: (task: AgentTask) => Promise<void> | void;
  onFail?: (task: AgentTask) => Promise<void> | void;
};
