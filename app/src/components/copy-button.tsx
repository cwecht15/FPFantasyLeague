"use client";

import { fireToast } from "@/components/toast";

export function CopyButton({
  text,
  toast,
  label = "Copy",
}: {
  text: string;
  toast: string;
  label?: string;
}) {
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
      {label}
    </button>
  );
}
