"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import {
  scoringCardSections,
  scoringCardText,
} from "@/lib/scoring/rules-card";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";
import { CopyButton } from "@/components/copy-button";
import { PrintButton } from "@/components/print-button";
import { ScoringCardView } from "@/components/scoring-card-view";

/**
 * Fullscreen scoring-card overlay for the Scoring Lab: covers the app chrome
 * so the card can be screenshotted in place, without needing the rules saved
 * anywhere. Portaled to <body> so that when printing, every sibling (the whole
 * app) can be display:none'd — only the card comes out, with no blank trailing
 * pages from the hidden content's layout height.
 */
export function ScoringCardOverlay({
  title,
  meta,
  season,
  rules,
  onClose,
}: {
  title: string;
  meta: string;
  season: number;
  rules: ScoringRules;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="scoring-card-overlay fixed inset-0 z-50 overflow-y-auto bg-ink">
      <style>{`
        @media print {
          body > :not(.scoring-card-overlay) { display: none !important; }
          .scoring-card-overlay {
            position: static;
            overflow: visible;
            background: #fff;
          }
        }
      `}</style>
      <div className="mx-auto max-w-[760px] px-6 py-8">
        <div className="mb-6 flex items-center gap-2.5 print:hidden">
          <button type="button" className="btn2" onClick={onClose}>
            ← Back to Lab
          </button>
          <span className="flex-1" />
          <CopyButton
            text={scoringCardText(title, season, rules)}
            toast="Scoring rules copied as text"
          />
          <PrintButton />
        </div>
        <ScoringCardView title={title} meta={meta} sections={scoringCardSections(rules)} />
      </div>
    </div>,
    document.body,
  );
}
