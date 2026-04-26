import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, CalendarDays, FileText, Landmark, Loader2, RefreshCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type RecordLike = Record<string, unknown>;

const REPORT_CODES = [
  { label: "Annual report", value: "11011" },
  { label: "Half-year report", value: "11012" },
  { label: "Quarterly report", value: "11013" },
  { label: "Corrected annual report", value: "11014" },
] as const;

function toRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function toRecordList(value: unknown): RecordLike[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }

  const record = toRecord(value);
  if (!record) return [];

  const list = record.list;
  if (Array.isArray(list)) {
    return list.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }

  const items = record.items;
  if (Array.isArray(items)) {
    return items.filter((item): item is RecordLike => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  }

  const corpCode = record.corp_code ?? record.corpCode ?? record.stock_code ?? record.stockCode;
  const corpName = record.corp_name ?? record.corpName ?? record.name;
  if (corpCode || corpName) return [record];

  return [];
}

function pickString(record: RecordLike | null, keys: string[]): string {
  if (!record) return "-";

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "-";
}

function findCorpCode(value: unknown): string {
  const records = toRecordList(value);
  for (const record of records) {
    const corpCode = pickString(record, ["corp_code", "corpCode", "stock_code", "stockCode"]);
    if (corpCode !== "-") return corpCode;
  }

  const single = toRecord(value);
  return pickString(single, ["corp_code", "corpCode", "stock_code", "stockCode"]);
}

function displayValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "number") return Number.isFinite(value) ? value.toLocaleString("en-US") : "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateDaysAgo(days: number) {
  const next = new Date();
  next.setDate(next.getDate() - days);
  return formatDateInput(next);
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="text-sm leading-6">{message}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300">
      <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400">
      <p className="font-medium text-slate-200">{title}</p>
      <p className="mt-1 leading-6">{description}</p>
    </div>
  );
}

export default function FinancePage() {
  const currentYear = new Date().getFullYear();
  const [searchInput, setSearchInput] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const [corpCode, setCorpCode] = useState("");
  const [year, setYear] = useState(String(currentYear));
  const [reportCode, setReportCode] = useState<(typeof REPORT_CODES)[number]["value"]>("11011");
  const [startDate, setStartDate] = useState(dateDaysAgo(30));
  const [endDate, setEndDate] = useState(formatDateInput(new Date()));

  const searchQuery = trpc.finance.searchCompanyByName.useQuery(
    { name: submittedName.trim() },
    { enabled: submittedName.trim().length > 0 }
  );
  const companyInfoQuery = trpc.finance.getCompanyInfo.useQuery(
    { corpCode },
    { enabled: corpCode.trim().length > 0 }
  );
  const disclosuresQuery = trpc.finance.getDisclosures.useQuery(
    { corpCode, startDate, endDate },
    { enabled: corpCode.trim().length > 0 }
  );
  const statementsQuery = trpc.finance.getFinancialStatements.useQuery(
    { corpCode, year, reportCode },
    { enabled: corpCode.trim().length > 0 }
  );

  const searchResults = useMemo(() => toRecordList(searchQuery.data), [searchQuery.data]);
  const selectedCompany = useMemo(() => {
    return toRecord(companyInfoQuery.data) ?? searchResults[0] ?? null;
  }, [companyInfoQuery.data, searchResults]);

  const suggestedCorpCode = useMemo(() => {
    return findCorpCode(selectedCompany ?? searchQuery.data);
  }, [searchQuery.data, selectedCompany]);

  useEffect(() => {
    if (!corpCode.trim() && suggestedCorpCode !== "-") {
      setCorpCode(suggestedCorpCode);
    }
  }, [corpCode, suggestedCorpCode]);

  const disclosures = useMemo(() => toRecordList(disclosuresQuery.data), [disclosuresQuery.data]);
  const statements = useMemo(() => toRecordList(statementsQuery.data), [statementsQuery.data]);

  const handleSearch = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    setSubmittedName(trimmed);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-950 to-black px-4 py-4 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-1">
          <h1 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-2xl font-bold leading-tight text-transparent md:text-3xl">
            DART Finance
          </h1>
          <p className="text-sm text-slate-400">Search companies, inspect disclosures, and review financial statements.</p>
        </div>

        <Card className="border-slate-700/70 bg-slate-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Landmark className="h-4 w-4 text-cyan-400" />
              Company Search
            </CardTitle>
            <CardDescription>Search a company name and the page will try to fill the corpCode automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Company name"
                className="border-slate-700 bg-slate-950/60 text-slate-100"
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
              />
              <Button onClick={handleSearch} className="bg-cyan-600 text-white hover:bg-cyan-500">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">corpCode</label>
                <Input
                  value={corpCode}
                  onChange={(event) => setCorpCode(event.target.value)}
                  placeholder="e.g. 00126380"
                  className="border-slate-700 bg-slate-950/60 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Year</label>
                <Input
                  value={year}
                  onChange={(event) => setYear(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="2026"
                  maxLength={4}
                  className="border-slate-700 bg-slate-950/60 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Report</label>
                <Select value={reportCode} onValueChange={(value) => setReportCode(value as typeof reportCode)}>
                  <SelectTrigger className="w-full border-slate-700 bg-slate-950/60 text-slate-100">
                    <SelectValue placeholder="Select report" />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_CODES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Disclosure start</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="border-slate-700 bg-slate-950/60 text-slate-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-400">Disclosure end</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="border-slate-700 bg-slate-950/60 text-slate-100"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_1.25fr]">
          <div className="space-y-6">
            <Card className="border-slate-700/70 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Building2 className="h-4 w-4 text-cyan-400" />
                  Company Info
                </CardTitle>
                <CardDescription>Search results and the selected company info appear here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {searchQuery.isLoading && <LoadingState label="Searching company..." />}
                {searchQuery.error && <ErrorState message={searchQuery.error.message} />}
                {!searchQuery.isLoading && !searchQuery.error && submittedName && searchResults.length === 0 && (
                  <EmptyState title="No search results." description="Try another company name or enter corpCode manually." />
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-3">
                    {searchResults.map((record, index) => {
                      const nextCorpCode = pickString(record, ["corp_code", "corpCode", "stock_code", "stockCode"]);
                      return (
                        <div key={`${nextCorpCode}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-white">{pickString(record, ["corp_name", "corpName", "name"])}</p>
                              <p className="text-xs text-slate-400">corpCode: {pickString(record, ["corp_code", "corpCode"])}</p>
                              <p className="text-xs text-slate-400">stockCode: {pickString(record, ["stock_code", "stockCode"])}</p>
                              <p className="text-xs text-slate-400">CEO: {pickString(record, ["ceo_nm", "ceoNm"])}</p>
                            </div>
                            {nextCorpCode !== "-" && (
                              <Button
                                variant="outline"
                                onClick={() => setCorpCode(nextCorpCode)}
                                className="border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500 hover:text-cyan-300"
                              >
                                Select
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedCompany ? (
                  <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                    <p className="mb-3 text-sm font-semibold text-white">Selected company</p>
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      {[
                        ["Company", pickString(selectedCompany, ["corp_name", "corpName", "name"])],
                        ["corpCode", pickString(selectedCompany, ["corp_code", "corpCode"])],
                        ["stockCode", pickString(selectedCompany, ["stock_code", "stockCode"])],
                        ["CEO", pickString(selectedCompany, ["ceo_nm", "ceoNm"])],
                        ["Est. date", pickString(selectedCompany, ["est_dt", "estDt"])],
                        ["Address", pickString(selectedCompany, ["adres", "address"])],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                          <dt className="text-xs text-slate-400">{label}</dt>
                          <dd className="mt-1 text-sm font-medium text-slate-100">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <EmptyState title="No selected company." description="Search a company name or enter corpCode directly." />
                )}

                {companyInfoQuery.isLoading && <LoadingState label="Loading company detail..." />}
                {companyInfoQuery.error && <ErrorState message={companyInfoQuery.error.message} />}
              </CardContent>
            </Card>

            <Card className="border-slate-700/70 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <CalendarDays className="h-4 w-4 text-cyan-400" />
                  Disclosures
                </CardTitle>
                <CardDescription>{corpCode ? `${corpCode} / ${startDate} to ${endDate}` : "Enter corpCode to fetch disclosures."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!corpCode.trim() && <EmptyState title="corpCode is required." description="Search a company first or type corpCode manually." />}
                {disclosuresQuery.isLoading && <LoadingState label="Loading disclosures..." />}
                {disclosuresQuery.error && <ErrorState message={disclosuresQuery.error.message} />}
                {!disclosuresQuery.isLoading && !disclosuresQuery.error && corpCode.trim() && disclosures.length === 0 && (
                  <EmptyState title="No disclosures found." description="Try another period or company code." />
                )}

                {disclosures.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-slate-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950/70 text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-medium">Title</th>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                        {disclosures.slice(0, 10).map((record, index) => (
                          <tr key={`${index}-${pickString(record, ["rcept_no", "rceptNo"])}`}>
                            <td className="px-4 py-3 text-slate-100">{pickString(record, ["report_nm", "rcept_title", "title", "corp_name"])}</td>
                            <td className="px-4 py-3 text-slate-400">{pickString(record, ["rcept_dt", "receiptDate", "date"])}</td>
                            <td className="px-4 py-3 text-slate-400">{pickString(record, ["rcept_no", "rceptNo"])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-slate-700/70 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  Financial Statements
                </CardTitle>
                <CardDescription>{corpCode ? `${year} / ${REPORT_CODES.find((item) => item.value === reportCode)?.label ?? reportCode}` : "Enter corpCode to fetch statements."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!corpCode.trim() && <EmptyState title="corpCode is required." description="Search a company or type the corpCode directly." />}
                {statementsQuery.isLoading && <LoadingState label="Loading statements..." />}
                {statementsQuery.error && <ErrorState message={statementsQuery.error.message} />}
                {!statementsQuery.isLoading && !statementsQuery.error && corpCode.trim() && statements.length === 0 && (
                  <EmptyState title="No statements found." description="Try another year or report code." />
                )}

                {statements.length > 0 && (
                  <div className="overflow-hidden rounded-xl border border-slate-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950/70 text-slate-300">
                        <tr>
                          <th className="px-4 py-3 font-medium">Account</th>
                          <th className="px-4 py-3 font-medium">Current</th>
                          <th className="px-4 py-3 font-medium">Previous</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-950/30">
                        {statements.slice(0, 15).map((record, index) => (
                          <tr key={`${index}-${pickString(record, ["account_nm", "accountNm"])}`}>
                            <td className="px-4 py-3 text-slate-100">
                              <div className="space-y-1">
                                <p className="font-medium">{pickString(record, ["account_nm", "accountNm"])}</p>
                                <p className="text-xs text-slate-500">{pickString(record, ["sj_nm", "sjNm"])}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{displayValue(record.thstrm_amount)}</td>
                            <td className="px-4 py-3 text-slate-400">{displayValue(record.frmtrm_amount ?? record.bfefrmtrm_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-700/70 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <RefreshCcw className="h-4 w-4 text-cyan-400" />
                  Raw Summary
                </CardTitle>
                <CardDescription>Useful when you need to inspect the raw payload quickly.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto rounded-xl border border-slate-700 bg-slate-950/70 p-4 text-xs leading-6 text-slate-300">
                  {displayValue(
                    selectedCompany ?? {
                      companyInfo: companyInfoQuery.data ?? null,
                      search: searchQuery.data ?? null,
                    }
                  )}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
