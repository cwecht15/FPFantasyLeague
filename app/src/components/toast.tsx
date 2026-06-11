"use client";

/**
 * Global toast (Game Day handoff, Global Shell #6): skewed flame banner,
 * bottom-center, ~2.4s. Fire from any client code via fireToast("Lineup set").
 */

import { useEffect, useState } from "react";

const EVENT = "fpfl:toast";

export function fireToast(message: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
  }
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onToast = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer);
    };
  }, []);

  if (!msg) return null;
  return (
    <div className="toast" role="status">
      <span>{msg}</span>
    </div>
  );
}
