"use client";

import { useState } from "react";
import { toBlob } from "html-to-image";

import { fireToast } from "@/components/toast";

/**
 * Copy image / Download PNG buttons for the scoring card. Renders the
 * `.card-shot` container (the card plus its dark padding, minus the
 * `.card-toolbar` row) to a 2x PNG in the browser, so the graphic matches the
 * on-screen card exactly — fonts, position chips, panel borders and all.
 */
async function capture(): Promise<Blob | null> {
  const el = document.querySelector<HTMLElement>(".card-shot");
  if (!el) return null;
  return toBlob(el, {
    backgroundColor: "#111111",
    pixelRatio: 2,
    // The clone keeps the container's computed centering margins, which would
    // shift the card inside the canvas — capture it flush instead.
    style: { margin: "0" },
    filter: (node) =>
      !(node instanceof HTMLElement && node.classList.contains("card-toolbar")),
  });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CardImageActions({ filename }: { filename: string }) {
  const [busy, setBusy] = useState(false);

  const withBusy = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn2 pri"
        disabled={busy}
        onClick={withBusy(async () => {
          try {
            // Safari requires the ClipboardItem to be constructed synchronously
            // with a promise for the blob, so capture inside the item.
            const item = new ClipboardItem({
              "image/png": capture().then((b) => {
                if (!b) throw new Error("capture failed");
                return b;
              }),
            });
            await navigator.clipboard.write([item]);
            fireToast("Card image copied");
          } catch {
            // Clipboard images need focus + permission; fall back to a file.
            const blob = await capture();
            if (blob) {
              download(blob, filename);
              fireToast("Clipboard unavailable — PNG downloaded instead");
            } else {
              fireToast("Copy failed");
            }
          }
        })}
      >
        {busy ? "Working…" : "Copy image"}
      </button>
      <button
        type="button"
        className="btn2"
        disabled={busy}
        onClick={withBusy(async () => {
          const blob = await capture();
          if (blob) {
            download(blob, filename);
            fireToast("PNG downloaded");
          } else {
            fireToast("Export failed");
          }
        })}
      >
        PNG
      </button>
    </>
  );
}
