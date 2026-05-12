import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MessageSearchFilters {
  query: string;
  source: "all" | "web" | "telegram";
  dateFrom: string;
  dateTo: string;
}

interface MessageSearchControlsProps {
  filters: MessageSearchFilters;
  onChange: (next: MessageSearchFilters) => void;
  onSearch: () => void;
  onClear: () => void;
  isSearching: boolean;
  isActive: boolean;
  resultCount?: number;
}

export default function MessageSearchControls({
  filters,
  onChange,
  onSearch,
  onClear,
  isSearching,
  isActive,
  resultCount,
}: MessageSearchControlsProps) {
  return (
    <div className="border-b border-border bg-card/70 px-4 py-3 flex-shrink-0">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Input
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="메시지 키워드 검색"
          className="sm:col-span-2"
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
        />
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Select
          value={filters.source}
          onValueChange={(value: "all" | "web" | "telegram") => onChange({ ...filters, source: value })}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="web">웹</SelectItem>
            <SelectItem value="telegram">텔레그램</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          onClick={onSearch}
          disabled={isSearching}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <Search className="w-4 h-4 mr-1.5" />
          검색
        </Button>

        {isActive && (
          <Button type="button" variant="outline" onClick={onClear}>
            <X className="w-4 h-4 mr-1.5" />
            초기화
          </Button>
        )}

        <div className="ml-auto text-xs text-muted-foreground">
          {isActive ? `검색 결과 ${resultCount ?? 0}건` : "최근 메시지 표시 중"}
        </div>
      </div>
    </div>
  );
}
