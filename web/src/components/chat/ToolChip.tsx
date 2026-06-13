import type { ToolChip as ToolChipData } from "@/lib/chat-reducer";

export function ToolChip({ tool }: { tool: ToolChipData }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60"
      title={tool.name}
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " + (tool.done ? "bg-emerald-400" : "bg-amber-400 animate-pulse")
        }
      />
      {tool.name}
    </span>
  );
}
