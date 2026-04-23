import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Calendar, HardDrive, Table2 } from "lucide-react";
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

export default function Google() {
  const [activeTab, setActiveTab] = useState<TabId>("gmail");

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-900 via-slate-950 to-black px-3 sm:px-4 md:px-8 py-3 sm:py-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent leading-tight">
            Google Workspace
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Gmail · Calendar · Drive · Sheets 통합 관리
          </p>
        </div>

        <GoogleAuthCard />

        <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700 overflow-x-auto scrollbar-thin">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`min-w-[88px] sm:min-w-0 flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-cyan-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-300 hover:bg-slate-700/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 md:p-6"
        >
          {activeTab === "gmail" && <GmailPanel />}
          {activeTab === "calendar" && <CalendarPanel />}
          {activeTab === "drive" && <DrivePanel />}
          {activeTab === "sheets" && <SheetsPanel />}
        </motion.div>
      </motion.div>
    </div>
  );
}
