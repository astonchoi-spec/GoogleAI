import { useEffect, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { AlertCircle, ExternalLink, RefreshCw, Table2, Loader2, Search, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const GOOGLE_SHEETS_API_URL =
  "https://console.cloud.google.com/apis/library/sheets.googleapis.com";
const GOOGLE_DRIVE_API_URL =
  "https://console.cloud.google.com/apis/library/drive.googleapis.com";
const FALLBACK_SHEET_TITLE = "Aston Workspace Data";

function quoteSheetTitle(sheetTitle: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'`;
}

function getDefaultRange(sheetTitle?: string): string {
  return `${quoteSheetTitle(sheetTitle?.trim() || FALLBACK_SHEET_TITLE)}!A1:Z100`;
}

function isGoogleWorkspaceApiDisabled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("GOOGLE_WORKSPACE_API_DISABLED")
    || message.includes("Google Sheets API has not been used")
    || message.includes("sheets.googleapis.com")
    || message.includes("Google Drive API has not been used")
    || message.includes("drive.googleapis.com");
}

export default function SheetsPanel() {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [range, setRange] = useState("");
  const [queryId, setQueryId] = useState("");
  const [queryRange, setQueryRange] = useState(getDefaultRange());
  const [apiDisabledError, setApiDisabledError] = useState(false);
  const utils = trpc.useUtils();
  const { data: defaultSpreadsheet } = trpc.googleWorkspace.sheets.getDefaultSpreadsheet.useQuery(); // MODIFIED: expose the configured workspace sheet as a one-click connection target.
  const connectDefaultSpreadsheet = trpc.googleWorkspace.sheets.connectDefaultSpreadsheet.useMutation();

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
    setQueryRange(range.trim() || getDefaultRange(defaultSpreadsheet?.sheetTitle)); // MODIFIED: use saved sheetTitle when user leaves range empty.
  };

  useEffect(() => {
    if (!defaultSpreadsheet?.spreadsheetId || spreadsheetId) return;
    setSpreadsheetId(defaultSpreadsheet.spreadsheetId); // MODIFIED: hydrate the input when a default sheet is already connected.
    setRange(getDefaultRange(defaultSpreadsheet.sheetTitle)); // MODIFIED: prefill with the saved tab title.
  }, [defaultSpreadsheet?.spreadsheetId, spreadsheetId]);

  const handleLoadDefault = async () => {
    setApiDisabledError(false);
    try {
      const wasCreated = !defaultSpreadsheet?.spreadsheetId;
      const target = defaultSpreadsheet?.spreadsheetId
        ? defaultSpreadsheet
        : await connectDefaultSpreadsheet.mutateAsync({ title: "Aston Workspace Data" }); // MODIFIED: create and persist a default sheet when none is configured.

      await utils.googleWorkspace.sheets.getDefaultSpreadsheet.invalidate();
      setSpreadsheetId(target.spreadsheetId);
      setQueryId(target.spreadsheetId);
      const nextRange = range.trim() || getDefaultRange(target.sheetTitle); // MODIFIED: query the actual stored tab title.
      setRange(nextRange);
      setQueryRange(nextRange);
      toast.success(wasCreated ? "기본 Google Sheet를 생성하고 연결했습니다." : "기본 Google Sheet를 연결했습니다.");
    } catch (error) {
      if (isGoogleWorkspaceApiDisabled(error)) {
        setApiDisabledError(true);
        return;
      }
      toast.error(error instanceof Error ? error.message : "기본 시트 연결에 실패했습니다.");
    }
  };

  const sheetRows = data?.data?.data ?? [];
  const sheetHeaders = data?.data?.headers ?? [];

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-[var(--aston-text)]">
        <Table2 className="h-4 w-4 text-cyan-400" />
        Google Sheets
      </h3>

      {apiDisabledError && (
        <Card className="space-y-4 border-amber-400/20 bg-amber-500/10 p-4 text-amber-100">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="space-y-2">
              <p className="font-semibold">Google Sheets API가 아직 활성화되지 않았습니다.</p>
              <p className="text-sm text-amber-100/85">
                Google Cloud Console에서 Sheets API를 사용 설정한 뒤 1~5분 후 다시 시도하세요.
                시트 생성 기능은 Google Sheets API와 Google Drive API가 모두 필요할 수 있습니다.
              </p>
              <p className="text-xs text-amber-100/70">
                API 활성화 후에도 실패하면 Google OAuth 재연결이 필요할 수 있습니다. 상단의 Google 연결을 해제한 뒤 다시 로그인해 주세요.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-amber-300/30 bg-black/10 text-amber-100 hover:bg-amber-400/10"
              onClick={() => window.open(GOOGLE_SHEETS_API_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Google Sheets API 열기
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-amber-300/30 bg-black/10 text-amber-100 hover:bg-amber-400/10"
              onClick={() => window.open(GOOGLE_DRIVE_API_URL, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Google Drive API 열기
            </Button>
            <Button
              type="button"
              className="bg-amber-300 text-slate-950 hover:bg-amber-200"
              onClick={handleLoadDefault}
              disabled={connectDefaultSpreadsheet.isPending}
            >
              {connectDefaultSpreadsheet.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              다시 시도
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-3 border-white/10 bg-[var(--aston-panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--aston-muted)]">
            {defaultSpreadsheet?.configured ? "기본 Workspace 시트가 설정되어 있습니다." : "기본 Workspace 시트 ID가 필요합니다."}
            {defaultSpreadsheet?.title ? ` (${defaultSpreadsheet.title})` : ""}
          </p>
          <Button
            onClick={handleLoadDefault}
            size="sm"
            variant="outline"
            disabled={connectDefaultSpreadsheet.isPending}
            className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
          >
            {connectDefaultSpreadsheet.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="mr-1 h-3.5 w-3.5" />
            )}
            {defaultSpreadsheet?.configured ? "기본 시트 연결" : "기본 시트 생성/연결"}
          </Button>
        </div>
        <Input
          placeholder="Spreadsheet ID"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          className="border-slate-600 bg-black/15 text-[var(--aston-text)] placeholder-slate-500"
        />
        <div className="flex gap-2">
          <Input
            placeholder={`Range, e.g. ${getDefaultRange(defaultSpreadsheet?.sheetTitle)}`}
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







