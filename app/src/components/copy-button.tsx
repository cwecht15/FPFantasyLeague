"use client";

import { fireToast } from "@/components/toast";

export function CopyButton({ text, toast }: { text: string; toast: string }) {
  return (
    <button
      type="button"
      className="btn2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          fireToast(toast);
        } catch {
          fireToast("Copy failed");
        }
      }}
    >
      Copy
    </button>
  );
}
