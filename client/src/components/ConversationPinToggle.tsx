import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ConversationPinToggleProps {
  pinned: boolean;
  onToggle: () => void;
  isSaving: boolean;
}

export default function ConversationPinToggle({
  pinned,
  onToggle,
  isSaving,
}: ConversationPinToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {pinned && <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-300">즐겨찾기</Badge>}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggle}
            disabled={isSaving}
            className={pinned ? "text-amber-300 hover:text-amber-200" : "text-muted-foreground hover:text-foreground"}
          >
            <Star className={`h-4 w-4 ${pinned ? "fill-amber-300" : ""}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{pinned ? "즐겨찾기 해제" : "현재 대화를 즐겨찾기에 추가"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
