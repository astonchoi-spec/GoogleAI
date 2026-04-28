import { Fragment, useState, useEffect } from "react";
import { useSearch } from "wouter";
import { motion } from "framer-motion";
import { Mail, Calendar, HardDrive, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import GoogleAuthCard from "@/components/GoogleWorkspace/GoogleAuthCard";
import GmailPanel from "@/components/GoogleWorkspace/GmailPanel";
import CalendarPanel from "@/components/GoogleWorkspace/CalendarPanel";
import DrivePanel from "@/components/GoogleWorkspace/DrivePanel";
import SheetsPanel from "@/components/GoogleWorkspace/SheetsPanel";

const TABS = [
  { id: "gmail", label: "Gmail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "drive", label: "Drive", icon: HardDrive },
  { id: "sheets", label: "Sheets", icon: Table2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

function resolveTab(search: string): TabId {
  const tab = new URLSearchParams(search).get("tab");
  return TABS.some((t) => t.id === tab) ? (tab as TabId) : "gmail";
}

export default function Google() {
  const search = useSearch();
  const [activeTab, setActiveTab] = useState<TabId>(() => resolveTab(search));

  useEffect(() => {
    const requested = resolveTab(search);
    setActiveTab(requested);
  }, [search]);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-5"
        >
          <div className="space-y-2">
            <Badge variant="outline" className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
              Google Workspace operations
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--aston-text)]">
              Google Workspace
            </h1>
            <p className="max-w-3xl text-sm text-[var(--aston-muted)]">
              Gmail, Calendar, Drive, Sheets를 하나의 업무 패널에서 통합 관리합니다.
            </p>
          </div>
        </motion.section>

        <GoogleAuthCard />

        <div className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-2">
          <div className="flex gap-2 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <Fragment key={tab.id}>
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-[8rem] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
                        : "bg-white/0 text-[var(--aston-muted)] hover:bg-white/5 hover:text-[var(--aston-text)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-2xl border border-white/10 bg-[var(--aston-panel)] p-4 md:p-6"
        >
          {activeTab === "gmail" && <GmailPanel />}
          {activeTab === "calendar" && <CalendarPanel />}
          {activeTab === "drive" && <DrivePanel />}
          {activeTab === "sheets" && <SheetsPanel />}
        </motion.div>
      </div>
    </div>
  );
}
