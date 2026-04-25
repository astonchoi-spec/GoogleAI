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

  const handleLoad = () => {
    if (!spreadsheetId.trim()) {
      toast.error("Please enter a spreadsheet ID.");
      return;
    }

    setQueryId(spreadsheetId.trim());
    setQueryRange(range.trim() || "Sheet1!A1:Z100");
  };

  const sheetRows = data?.data?.data ?? [];
  const sheetHeaders = data?.data?.headers ?? [];

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-[var(--aston-text)]">
        <Table2 className="h-4 w-4 text-cyan-400" />
        Google Sheets
      </h3>

      <Card className="space-y-3 border-white/10 bg-[var(--aston-panel)] p-4">
        <Input
          placeholder="Spreadsheet ID"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          className="border-slate-600 bg-black/15 text-[var(--aston-text)] placeholder-slate-500"
        />
        <div className="flex gap-2">
          <Input
            placeholder="Range, e.g. Sheet1!A1:Z100"
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="border-slate-600 bg-black/15 text-[var(--aston-text)] placeholder-slate-500"
          />
          <Button onClick={handleLoad} size="sm" className="shrink-0 bg-cyan-600 text-[var(--aston-text)] hover:bg-cyan-700">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      )}

      {sheetRows.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                {sheetHeaders.length > 0 && (
                  <tr className="bg-black/15">
                    {sheetHeaders.map((header: any, headerIdx: number) => (
                      <th
                        key={headerIdx}
                        className="max-w-[200px] truncate border-r border-white/10 px-3 py-2 text-left font-medium text-cyan-300 last:border-r-0"
                      >
                        {String(header ?? "")}
                      </th>
                    ))}
                  </tr>
                )}
                {sheetRows.map((row: any[], rowIdx: number) => (
                  <tr key={rowIdx} className={rowIdx % 2 === 0 ? "bg-black/10" : "bg-black/10/50"}>
                    {row.map((cell: any, cellIdx: number) => (
                      <td
                        key={cellIdx}
                        className={`max-w-[200px] truncate border-r border-white/10 px-3 py-2 last:border-r-0 ${
                          rowIdx === 0 && sheetHeaders.length === 0 ? "font-medium text-cyan-300" : "text-slate-300"
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

      {queryId && !isLoading && sheetRows.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--aston-muted)]">No rows were returned for this range.</p>
      )}
    </div>
  );
}







