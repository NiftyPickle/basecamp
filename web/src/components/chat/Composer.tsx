import { useState, type KeyboardEvent } from "react";

export function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-black/30 bg-[#241f38] p-3">
      <textarea
        className="min-h-[44px] max-h-40 flex-1 resize-none rounded-2xl border border-transparent bg-[#16122a] px-4 py-2.5 text-sm text-[#dcd8ec] placeholder:text-[#8b86a6] outline-none focus:border-[#5865F2]"
        placeholder="Message Basecamp…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
      />
      <button
        className="rounded-2xl bg-[#5865F2] hover:bg-[#4752C4] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
      >
        Send
      </button>
    </div>
  );
}
