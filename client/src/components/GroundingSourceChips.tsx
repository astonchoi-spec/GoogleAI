/**
 * GroundingSourceChips
 * Renders a compact row of citation chips below AI messages when Gemini
 * Search Grounding returns source URLs.
 */

import { ExternalLink } from "lucide-react";

interface GroundingSourceChipsProps {
  sources: Array<{ title: string; uri: string }>;
}

// MODIFIED: display Gemini grounding citations as UI chips instead of plain appended text.
export default function GroundingSourceChips({ sources }: GroundingSourceChipsProps) {
  const visible = sources.slice(0, 5);
  if (visible.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((source) => (
        <a
          key={source.uri}
          href={source.uri}
          target="_blank"
          rel="noopener noreferrer"
          title={source.title}
          className="inline-flex max-w-[180px] items-center gap-1 truncate rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-cyan-300/80 transition-colors hover:border-cyan-500/40 hover:text-cyan-200"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{source.title}</span>
        </a>
      ))}
    </div>
  );
}
