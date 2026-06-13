import { openExternal } from "@/lib/api";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/keys";

type Props = {
  onRecheck: () => void;
};

export function OpenRouterOnboarding({ onRecheck }: Props) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-black/20 bg-black/20 p-6 text-sm text-[#cfcae0]">
      <h2 className="text-base font-semibold text-[#dcd8ec]">Turn on Free chat</h2>
      <p className="mt-2 text-[#b6b0d0]">
        Free chat and Council run through OpenRouter. Add a key once and both light up. The key stays
        on the server - paste it in the app's Keys surface, not here.
      </p>
      <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-[#b6b0d0]">
        <li>
          Create a free OpenRouter key (no card needed) at{" "}
          <a
            href={OPENROUTER_KEYS_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              // The desktop webview swallows target=_blank; route through the
              // host browser explicitly. Harmless in a normal browser too.
              e.preventDefault();
              void openExternal(OPENROUTER_KEYS_URL);
            }}
            className="text-[#8b9bff] underline"
          >
            openrouter.ai/keys
          </a>
          .
        </li>
        <li>
          Open the <span className="rounded bg-black/30 px-1">Keys</span> page (key icon in the
          sidebar) and save it as{" "}
          <code className="rounded bg-black/30 px-1">OPENROUTER_API_KEY</code>.
        </li>
        <li>Come back and re-check.</li>
      </ol>
      <button
        type="button"
        onClick={onRecheck}
        className="mt-5 rounded-full bg-[#5865F2] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#4752c4]"
      >
        Re-check key
      </button>
    </div>
  );
}
