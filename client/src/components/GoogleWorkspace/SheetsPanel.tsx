import { useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Table2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function SheetsPanel() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState("Sheet1!A1:Z100");
  const [queryId, setQueryId] = useState("");
  const [queryRange, setQueryRange] = useState("Sheet1!A1:Z100");

  const { data, isLoading } = trpc.googleWorkspace.sheets.readSheet.useQuery(
    { spreadsheetId: queryId, range: queryRange },
    { enabled: !!queryId }
  );

  const sheetData = data?.data;
  const rows = sheetData?.data ?? [];

  const handleLoad = () => {
    if (!spreadsheetId.trim()) {
      toast.error("스프레드시트 ID를 입력하세요.");
      return;
    }
    setQueryId(spreadsheetId.trim());
    setQueryRange(range.trim() || "Sheet1!A1:Z100");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Table2 className="w-4 h-4 text-cyan-400" />
        Google Sheets
      </h3>

      <Card className="bg-slate-800 border-slate-700 p-4 space-y-3">
        <Input
          placeholder="스프레드시트 ID (URL에서 복사)"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
        />
        <div className="flex gap-2">
          <Input
            placeholder="범위 (예: Sheet1!A1:Z100)"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
          />
          <Button onClick={handleLoad} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0">
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      )}

      {rows.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <tbody>
                {rows.map((row: any[], rowIdx: number) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-slate-800" : "bg-slate-800/50"}>
                    {row.map((cell: any, cellIdx: number) => (
                      <td
                        key={cellIdx}
                        className={`px-3 py-2 border-r border-slate-700 last:border-r-0 truncate max-w-[200px] ${
                          rowIdx === 0 ? "text-cyan-300 font-medium" : "text-slate-300"
                        }`}
                      >
                        {String(cell ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {queryId && !isLoading && rows.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-4">데이터가 없거나 접근 권한이 없습니다.</p>
      )}
    </div>
  );
}
