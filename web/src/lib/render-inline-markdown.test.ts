import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { renderInlineMarkdown } from "./render-inline-markdown";

function html(text: string): string {
  return renderToString(createElement(Fragment, null, ...renderInlineMarkdown(text)));
}

describe("renderInlineMarkdown", () => {
  test("renders double-asterisk as bold with no literal asterisks", () => {
    const out = html("hello **world** there");
    expect(out).toContain("<strong>world</strong>");
    expect(out).not.toContain("*");
  });

  test("renders double-underscore as bold", () => {
    const out = html("a __strong__ b");
    expect(out).toContain("<strong>strong</strong>");
    expect(out).not.toContain("_");
  });

  test("renders single-asterisk as italic", () => {
    const out = html("an *emphasis* word");
    expect(out).toContain("<em>emphasis</em>");
  });

  test("renders inline code and keeps punctuation literal inside it", () => {
    const out = html("run `a*b` now");
    expect(out).toContain("<code");
    expect(out).toContain("a*b");
  });

  test("leaves plain text untouched", () => {
    expect(html("just plain text")).toBe("just plain text");
  });

  test("returns empty array for empty input", () => {
    expect(renderInlineMarkdown("")).toEqual([]);
  });
});
