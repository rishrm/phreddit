import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

// Force links in user content to open safely in a new tab.
if (typeof window !== "undefined") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
    if (node.tagName === "IMG") {
      const source = node.getAttribute("src");
      if (source) {
        try {
          const url = new URL(source, window.location.origin);
          if (url.origin !== window.location.origin && url.protocol !== "https:") {
            node.removeAttribute("src");
          }
        } catch {
          node.removeAttribute("src");
        }
      }
      node.setAttribute("loading", "lazy");
      node.setAttribute("decoding", "async");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
}

// Renders user-authored markdown. All HTML output is sanitized with
// DOMPurify before being injected, which strips scripts, event handlers,
// and javascript: URLs.
export default function RichText({ text, allowImages = false }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(text || ""), {
      FORBID_ATTR: ["style"],
      ...(allowImages ? {} : { FORBID_TAGS: ["img"] })
    }),
    [text, allowImages]
  );
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
