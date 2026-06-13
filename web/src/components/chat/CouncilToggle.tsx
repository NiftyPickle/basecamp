type Props = {
  checked: boolean;
  available: boolean;
  onChange: (next: boolean) => void;
};

const UNAVAILABLE_HINT =
  "Add a free OpenRouter key (no card needed) to enable Council. See the onboarding card.";

export function CouncilToggle({ checked, available, onChange }: Props) {
  const disabled = !available;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={disabled ? UNAVAILABLE_HINT : "Council Mode: 3-4 models deliberate, then synthesize one verdict"}
      onClick={() => !disabled && onChange(!checked)}
      className={
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs transition " +
        (disabled
          ? "cursor-not-allowed bg-black/20 text-[#6b6589] opacity-60"
          : checked
            ? "bg-[#5865F2] text-white"
            : "bg-black/30 text-[#b6b0d0] hover:bg-black/40")
      }
    >
      <span
        className={
          "inline-block h-2 w-2 rounded-full " + (checked && !disabled ? "bg-white" : "bg-[#6b6589]")
        }
      />
      Council
    </button>
  );
}
