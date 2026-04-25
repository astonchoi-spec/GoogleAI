import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface MessageEditBarProps {
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export default function MessageEditBar({
  content,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: MessageEditBarProps) {
  return (
    <Card className="border-cyan-500/20 bg-cyan-500/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-cyan-300">메시지 편집</p>
          <p className="text-xs text-muted-foreground">저장하면 현재 대화 기록이 즉시 갱신됩니다.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 border-slate-700 bg-slate-950/60 text-sm text-white"
        placeholder="메시지 내용을 수정하세요"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="button" onClick={onSave} disabled={isSaving || !content.trim()} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          <Check className="mr-1.5 h-4 w-4" />
          {isSaving ? "저장 중" : "저장"}
        </Button>
      </div>
    </Card>
  );
}
