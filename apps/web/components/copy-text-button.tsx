"use client";

import { useState } from "react";

/**
 * Copies a block of text the server already rendered.
 *
 * The text is a prop rather than something fetched on click: the click must
 * call `navigator.clipboard.writeText` inside the user-gesture window, and an
 * await on a network round-trip first loses that permission in Safari.
 */
export function CopyTextButton({
  text,
  label = "העתק",
  copiedLabel = "הועתק ✓",
  className = "btn btn-secondary text-xs",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Insecure origin, or the user denied clipboard access. Saying nothing
      // would look like it worked, so the label reports the failure instead.
      setCopied(false);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? copiedLabel : label}
    </button>
  );
}
