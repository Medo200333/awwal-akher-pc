import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hikMapFn } from "@/lib/hikvision.functions";

type ButtonRow = {
  key: string;
  ar: string;
  en: string;
  meaning: string;
  found: boolean;
  path: string;
  count: number;
  names: string[];
};

type SavedMap = { stamp: string; buttons: ButtonRow[] };

const MEMORY = "awwal-team-map";

export function TeamEngine({ apiBase, sessionId }: { apiBase: string; sessionId: string }) {
  const readMap = useServerFn(hikMapFn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [buttons, setButtons] = useState<ButtonRow[]>([]);

  async function readTeam() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const result = await readMap({ data: { apiBase, sessionId } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const previous = load();
      const lines: string[] = [];
      if (!previous) lines.push("أول قراءة. اتحفظت كآخر صورة للتيم.");
      else {
        for (const button of result.buttons) {
          const old = previous.buttons.find((item) => item.key === button.key);
          if (old?.found && !button.found) lines.push(`${button.ar}: الزرار القديم اختفى، والمسارات البديلة ما لقتهوش.`);
          else if (old?.path && button.path && old.path !== button.path) lines.push(`${button.ar}: المكان اتغير، والبرنامج لقى المسار الجديد.`);
          else if (old && old.names.join() !== button.names.join()) lines.push(`${button.ar}: البيانات اتغيرت من آخر قراءة.`);
        }
        if (!lines.length) lines.push("نفس آخر قراءة. مفيش تحديث على البيانات.");
      }
      localStorage.setItem(MEMORY, JSON.stringify({ stamp: result.stamp, buttons: result.buttons } satisfies SavedMap));
      setButtons(result.buttons);
      setNote(lines.join(" "));
    } catch {
      setError("القراءة انقطعت. ادخل على الموقع تاني.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const body = buttons
      .map(
        (button) =>
          `<h2>${button.ar} — ${button.en}</h2><p>${button.meaning}</p><p>${button.found ? `موجود. العدد الظاهر: ${button.count}.` : "مش ظاهر في المسارات المعروفة."}</p><p>${button.names.join(" · ")}</p>`,
      )
      .join("");
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قراءة التيم</title><body style="font-family:sans-serif;max-width:800px;margin:auto;padding:24px"><h1>ترجمة قراءة هيك-كونكت تيم</h1>${body}</body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    link.download = "قراءة-التيم.html";
    link.click();
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void readTeam()}
        disabled={busy}
        className="h-11 rounded-md border border-brass px-4 text-sm font-medium text-brass disabled:opacity-50"
      >
        {busy ? "بيقرأ التيم…" : "اقرأ التيم"}
      </button>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {note ? <p className="text-sm leading-7 text-ink">{note}</p> : null}
      {buttons.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {buttons.map((button) => (
              <li key={button.key} className="rounded-md border border-line px-3 py-2 text-sm leading-7">
                <strong>{button.ar}</strong>
                <span className="text-muted"> · {button.en}</span>
                <span className={button.found ? "text-brass" : "text-clay"}>{button.found ? ` · ظاهر (${button.count})` : " · مش ظاهر"}</span>
                <span className="mt-1 block text-ink">{button.meaning}</span>
                {button.names.length ? <span className="mt-1 block text-muted" dir="ltr">{button.names.slice(0, 8).join(" · ")}</span> : null}
              </li>
            ))}
          </ul>
          <button type="button" onClick={download} className="h-11 rounded-md border border-line px-4 text-sm">
            تصدير الترجمة
          </button>
        </>
      ) : null}
    </div>
  );
}

function load(): SavedMap | null {
  try {
    const raw = localStorage.getItem(MEMORY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMap;
    if (!Array.isArray(parsed.buttons)) return null;
    return parsed;
  } catch {
    return null;
  }
}
