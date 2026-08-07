"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn2" onClick={() => window.print()}>
      Print / save PDF
    </button>
  );
}
