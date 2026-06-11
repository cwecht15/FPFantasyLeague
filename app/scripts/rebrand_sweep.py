"""One-shot rebrand sweep (run from app/): fix mojibake from a bad PS pass,
then map legacy Tailwind color classes to FantasyPoints brand tokens in every
src/**/*.ts(x). ASCII-only source so any shell can run it.
"""

import io
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..", "src")

# Ordered: most-specific first.
MAP = [
    ("bg-white font-semibold text-black", "bg-paper font-semibold text-ink"),
    ("bg-white px-4 py-2 font-medium text-black hover:bg-neutral-200", "btn-flame px-4 py-2"),
    ("bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200", "btn-flame px-4 py-2 text-sm"),
    ("bg-white px-5 py-2.5 font-medium text-black hover:bg-neutral-200", "btn-flame px-5 py-2.5"),
    ("bg-white px-7 py-3", "btn-flame px-7 py-3"),
    ("bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-emerald-500", "btn-flame px-2 py-0.5 text-xs"),
    ("border-emerald-700 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-950", "border-line-strong px-2 py-0.5 text-xs text-paper hover:bg-surface"),
    ("bg-emerald-700 px-2 py-0.5 text-xs", "bg-flame px-2 py-0.5 text-xs font-bold"),
    ("bg-emerald-950 font-semibold", "bg-flame/10 font-semibold"),
    ("text-emerald-400", "text-paper/80"),
    ("text-emerald-300", "text-flame"),
    ("border-red-800 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950", "border-flame/60 px-2 py-0.5 text-xs text-flame hover:bg-flame/10"),
    ("bg-amber-950/30", "bg-flame/10"),
    ("bg-amber-800 px-2 py-0.5 text-xs", "bg-surface px-2 py-0.5 text-xs font-bold text-paper"),
    ("text-amber-400", "text-flame"),
    ("text-amber-500", "text-faint"),
    ("text-red-400", "text-flame"),
    ("text-sm font-semibold uppercase tracking-wide text-neutral-400", "label text-sm"),
    ("text-xs font-semibold uppercase tracking-wide text-neutral-400", "label"),
    ("placeholder:text-neutral-500", "placeholder:text-faint"),
    ("hover:border-neutral-600", "hover:border-line-strong"),
    ("focus:border-neutral-400", "focus:border-paper"),
    ("hover:bg-neutral-950", "hover:bg-pit"),
    ("hover:bg-neutral-900", "hover:bg-surface"),
    ("hover:bg-neutral-200", "hover:opacity-90"),
    ("bg-neutral-950", "bg-pit"),
    ("bg-neutral-900", "bg-surface"),
    ("border-neutral-700", "border-line-strong"),
    ("border-neutral-800", "border-line"),
    ("border-neutral-900", "border-line"),
    ("text-neutral-300", "text-paper/80"),
    ("text-neutral-400", "text-muted"),
    ("text-neutral-500", "text-faint"),
    ("text-neutral-600", "text-faint"),
    ("hover:text-white", "hover:text-paper"),
    ("text-white", "text-paper"),
    # typography roles
    ('className="text-2xl font-bold"', 'className="display text-3xl"'),
    ('className="text-lg font-semibold"', 'className="display text-xl"'),
]

MOJI_MARKERS = ["â€", "Ã", "ðŸ", "Â·", "âœ", "â±"]


def demojibake(text: str) -> str:
    if not any(m in text for m in MOJI_MARKERS):
        return text
    try:
        return text.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def main() -> None:
    fixed = swept = 0
    for dirpath, _dirs, files in os.walk(os.path.abspath(ROOT)):
        for fn in files:
            if not fn.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, fn)
            with io.open(path, "r", encoding="utf-8-sig") as f:
                text = f.read()
            orig = text
            text2 = demojibake(text)
            if text2 != text:
                fixed += 1
            text = text2
            for old, new in MAP:
                text = text.replace(old, new)
            if text != orig:
                with io.open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(text)
                swept += 1
    print(f"mojibake-fixed: {fixed}, files changed: {swept}")
    # report any stragglers
    pat = re.compile(r"neutral-\d|emerald-|amber-|red-(3|4|8|9)\d\d")
    for dirpath, _dirs, files in os.walk(os.path.abspath(ROOT)):
        for fn in files:
            if not fn.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(dirpath, fn)
            with io.open(path, "r", encoding="utf-8-sig") as f:
                for i, line in enumerate(f, 1):
                    if pat.search(line):
                        print(f"LEFTOVER {os.path.relpath(path, ROOT)}:{i}: {line.strip()[:100]}")


if __name__ == "__main__":
    main()
