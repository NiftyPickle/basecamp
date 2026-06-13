import type { ReactNode } from "react";

/**
 * Minimal inline markdown renderer for chat bubbles.
 *
 * Handles the common inline tokens that otherwise leak raw punctuation into
 * the chat UI: bold (`**x**` / `__x__`), italic (`*x*` / `_x_`), and inline
 * code (`` `x` ``). Block-level markdown is intentionally not handled - the
 * bubble keeps `whitespace-pre-wrap`, so newlines and lists render as typed.
 *
 * Returns an array of React nodes so the caller can drop it straight into JSX.
 */

// Order matters: inline code is matched first so punctuation inside backticks
// stays literal, then bold (two markers) before italic (one marker).
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function renderToken(token: string, key: number): ReactNode {
  if (token.startsWith("`") && token.endsWith("`")) {
    return (
      <code key={key} className="rounded bg-black/30 px-1 py-0.5 text-[0.85em]">
        {token.slice(1, -1)}
      </code>
    );
  }
  if (token.startsWith("**") && token.endsWith("**")) {
    return <strong key={key}>{token.slice(2, -2)}</strong>;
  }
  if (token.startsWith("__") && token.endsWith("__")) {
    return <strong key={key}>{token.slice(2, -2)}</strong>;
  }
  if (token.startsWith("*") && token.endsWith("*")) {
    return <em key={key}>{token.slice(1, -1)}</em>;
  }
  if (token.startsWith("_") && token.endsWith("_")) {
    return <em key={key}>{token.slice(1, -1)}</em>;
  }
  return token;
}

export function renderInlineMarkdown(text: string): ReactNode[] {
  if (!text) return [];
  const parts = text.split(TOKEN);
  return parts.map((part, i) =>
    i % 2 === 1 ? renderToken(part, i) : part,
  );
}
