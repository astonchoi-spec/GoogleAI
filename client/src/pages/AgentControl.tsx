import React, { useEffect, useMemo, useState } from "react";
import { Bot, Play, X, Clock, CheckCircle2, AlertCircle } from "lucide-react";

type AgentTemplateInput = {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
};

type AgentTemplate = {
  id: string;
  label: string;
  description: string;
  category: "pf" | "trading" | "research";
  inputs: AgentTemplateInput[];
};

type AgentStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type AgentTask = {
  id: string;
  templateId: string;
  templateLabel: string;
  target: string;
  status: AgentStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  resultPreview?: string;
  error?: string;
  result?: { wikiPath: string | null; markdown: string };
};

type TemplatesResponse = {
  templates: AgentTemplate[];
  simulationMode: boolean;
  permissionLevel: number;
  permissionLabel: string;
};

const STATUS_TEXT: Record<AgentStatus, string> = {
  pending: "대기",
  running: "진행 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소",
};

const STATUS_ICON: Record<AgentStatus, React.ReactElement> = {
  pending: <Clock size={16} />,
  running: <Play size={16} />,
  completed: <CheckCircle2 size={16} />,
  failed: <AlertCircle size={16} />,
  cancelled: <X size={16} />,
};

export default function AgentControl(): React.ReactElement {
  const [meta, setMeta] = useState<TemplatesResponse | null>(null);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [modalTemplate, setModalTemplate] = useState<AgentTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/templates")
      .then((r) => r.json())
      .then((data: TemplatesResponse) => {
        if (!cancelled) setMeta(data);
      })
      .catch((err) => console.error("[AgentControl] templates:", err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch("/api/agents/tasks")
        .then((r) => r.json())
        .then((data: { tasks: AgentTask[] }) => {
          if (!cancelled) setTasks(data.tasks);
        })
        .catch((err) => console.error("[AgentControl] tasks:", err));
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const active = useMemo(() => tasks.filter((t) => t.status === "pending" || t.status === "running"), [tasks]);
  const recent = useMemo(() => tasks.filter((t) => t.status !== "pending" && t.status !== "running").slice(0, 10), [tasks]);

  function openModal(template: AgentTemplate): void {
    setModalTemplate(template);
    setFormValues({});
    setSubmitError(null);
  }

  async function submitTask(): Promise<void> {
    if (!modalTemplate) return;
    const target = formValues.target?.trim();
    if (!target) {
      setSubmitError("대상을 입력해주세요.");
      return;
    }
    const inputs: Record<string, string> = {};
    for (const input of modalTemplate.inputs) {
      if (input.key === "target") continue;
      const value = formValues[input.key]?.trim();
      if (value) inputs[input.key] = value;
    }
    try {
      const response = await fetch("/api/agents/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: modalTemplate.id, target, inputs }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: "등록 실패" }));
        setSubmitError(errBody.error || "등록 실패");
        return;
      }
      setModalTemplate(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "등록 실패");
    }
  }

  async function cancelTask(id: string): Promise<void> {
    try {
      await fetch(`/api/agents/tasks/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[AgentControl] cancel:", err);
    }
  }

  return (
    <div style={{ padding: "24px", color: "#e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Bot size={28} style={{ color: "#22d3ee" }} />
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Agent Control</h1>
      </div>
      <div style={panelStyle}>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>권한 단계</div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>{meta?.permissionLabel ?? "로딩 중..."}</div>
        <div style={{ fontSize: 12, color: meta?.simulationMode ? "#facc15" : "#34d399", marginTop: 4 }}>
          {meta?.simulationMode ? "🧪 시뮬레이션 모드 (OpenClaw 미연동)" : "🛰 OpenClaw 연동 모드"}
        </div>
      </div>

      <h2 style={sectionTitleStyle}>빠른 실행</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {meta?.templates.map((template) => (
          <button key={template.id} style={cardStyle} onClick={() => openModal(template)}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{template.label}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>{template.description}</div>
            <div style={{ fontSize: 11, color: "#22d3ee", marginTop: 10 }}>{template.id}</div>
          </button>
        ))}
      </div>

      <h2 style={sectionTitleStyle}>진행 중·대기 ({active.length})</h2>
      <div style={listStyle}>
        {active.length === 0 ? <div style={emptyStyle}>진행 중 작업이 없습니다.</div> : active.map((task) => (
          <TaskRow key={task.id} task={task} onCancel={() => cancelTask(task.id)} />
        ))}
      </div>

      <h2 style={sectionTitleStyle}>최근 완료 (최대 10건)</h2>
      <div style={listStyle}>
        {recent.length === 0 ? <div style={emptyStyle}>완료된 작업이 없습니다.</div> : recent.map((task) => (
          <TaskRow key={task.id} task={task} onCancel={() => cancelTask(task.id)} />
        ))}
      </div>

      {modalTemplate && (
        <div style={modalOverlayStyle} onClick={() => setModalTemplate(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{modalTemplate.label}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>{modalTemplate.description}</div>
            {modalTemplate.inputs.map((input) => (
              <label key={input.key} style={{ display: "block", marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 4 }}>
                  {input.label}{input.required ? " *" : ""}
                </div>
                <input
                  type="text"
                  placeholder={input.placeholder}
                  value={formValues[input.key] ?? ""}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [input.key]: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            ))}
            {submitError && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{submitError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={btnSecondary} onClick={() => setModalTemplate(null)}>취소</button>
              <button style={btnPrimary} onClick={submitTask}>실행</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onCancel }: { task: AgentTask; onCancel: () => void }): React.ReactElement {
  const seconds = task.durationMs ? (task.durationMs / 1000).toFixed(1) : null;
  return (
    <div style={taskRowStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {STATUS_ICON[task.status]}
        <span style={{ fontWeight: 500 }}>{task.templateLabel}</span>
        <span style={{ color: "#94a3b8", fontSize: 13 }}>· {task.target}</span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
        {STATUS_TEXT[task.status]} · {task.id}{seconds ? ` · ${seconds}s` : ""}
      </div>
      {task.resultPreview && <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 6, whiteSpace: "pre-wrap" }}>{task.resultPreview}</div>}
      {task.error && <div style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>{task.error}</div>}
      {(task.status === "pending" || task.status === "running") && (
        <button style={{ ...btnSecondary, marginTop: 8 }} onClick={onCancel}>취소</button>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = { background: "rgba(15,23,42,0.7)", border: "1px solid rgba(34,211,238,0.2)", borderRadius: 10, padding: 16, marginBottom: 16 };
const sectionTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 10, color: "#cbd5e1" };
const cardStyle: React.CSSProperties = { background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14, textAlign: "left", color: "#e2e8f0", cursor: "pointer" };
const listStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const taskRowStyle: React.CSSProperties = { background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: 12 };
const emptyStyle: React.CSSProperties = { color: "#64748b", fontSize: 13, padding: 12 };
const modalOverlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "#0f172a", border: "1px solid rgba(34,211,238,0.3)", borderRadius: 12, padding: 24, width: "min(420px, 90vw)", color: "#e2e8f0" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#e2e8f0", fontSize: 14 };
const btnPrimary: React.CSSProperties = { padding: "8px 14px", background: "#22d3ee", border: "none", borderRadius: 6, color: "#0f172a", fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "#cbd5e1", cursor: "pointer", fontSize: 13 };
