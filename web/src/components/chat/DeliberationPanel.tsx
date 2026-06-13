import type { Deliberation, DeliberationMember } from "@/lib/chat-reducer";
// The backend (hermes_cli/council/ws.py) is the single source of truth for
// friendly labels; the slug tail is only a fallback for blobs lacking them.
import { friendlyModelLabel as fallbackLabel } from "@/lib/model-label";

function memberLabel(member: DeliberationMember): string {
  return member.label ?? fallbackLabel(member.model);
}

function MemberRow({ member }: { member: DeliberationMember }) {
  if (!member.ok) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2 text-xs text-red-200">
        <span className="font-medium">{memberLabel(member)}</span>
        <span className="ml-2 opacity-80">unavailable (dropped from this round)</span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-black/20 bg-black/20 px-3 py-2 text-xs">
      <div className="font-medium text-[#dcd8ec]">{memberLabel(member)}</div>
      {member.answer && (
        <div className="mt-1 whitespace-pre-wrap text-[#cfcae0]">{member.answer}</div>
      )}
      {member.critique && (
        <div className="mt-2 border-l-2 border-[#5865F2]/50 pl-2 italic text-[#b6b0d0]">
          {member.critique}
        </div>
      )}
    </div>
  );
}

export function DeliberationPanel({ deliberation }: { deliberation: Deliberation }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer select-none text-xs text-[#9b95bd] hover:text-[#dcd8ec]">
        Show full deliberation ({deliberation.members.filter((m) => m.ok).length} of{" "}
        {deliberation.members.length} members)
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {deliberation.members.map((m) => (
          <MemberRow key={m.model} member={m} />
        ))}
        <div className="text-[0.7rem] text-[#7d7799]">
          Synthesized by {deliberation.synthesizer_label ?? fallbackLabel(deliberation.synthesizer)}
        </div>
      </div>
    </details>
  );
}
