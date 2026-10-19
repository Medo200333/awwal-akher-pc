const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export type DeskDevice = {
  id: string;
  lastPull: string | null;
  lastOk: string | null;
  error: string;
  daily: boolean;
  drift: number | null;
  timeChecked: string | null;
};

export const seedDevices = (): DeskDevice[] => [
  { id: "1", lastPull: null, lastOk: "2026-10-19", error: "", daily: true, drift: null, timeChecked: null },
  { id: "2", lastPull: "2026-10-19", lastOk: "2026-10-19", error: "", daily: true, drift: -0.1, timeChecked: "2026-10-19" },
];

function ar(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function StackDate({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-muted">—</span>;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-base text-ink">{ar(day)}</span>
      <span className="text-xs text-muted">{MONTHS[month - 1]}</span>
      <span className="text-xs text-muted">{ar(year)}</span>
    </span>
  );
}

const ghost =
  "min-h-11 w-full rounded-full border border-brass px-2 py-2 text-center text-sm leading-tight text-brass disabled:opacity-50";
const solid =
  "min-h-11 w-full rounded-full bg-brass px-2 py-2 text-center text-sm font-medium leading-tight text-brass-ink disabled:opacity-50";

export function DeviceDesk({
  devices,
  busy,
  linkOpen,
  numbers,
  onTest,
  onPull,
  onSync,
  onLink,
  onSetTime,
  onStopDaily,
}: {
  devices: DeskDevice[];
  busy: boolean;
  linkOpen: string;
  numbers: { no: string; name: string }[];
  onTest: (id: string) => void;
  onPull: (id: string) => void;
  onSync: (id: string) => void;
  onLink: (id: string) => void;
  onSetTime: (id: string) => void;
  onStopDaily: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-brass bg-desk">
      <div className="flex items-start justify-between gap-2 bg-desk-head px-2">
        <div className="desk-status py-3 text-sm text-brass">
          <span>آخر سحب</span>
          <span>
            آخر
            <br />
            نجاح
          </span>
          <span>الوقت</span>
          <span>خطأ</span>
        </div>
        <div className="desk-actions py-3 text-center text-sm text-brass">إجراء</div>
      </div>
      {devices.map((device, index) => (
        <article key={device.id} className={index ? "border-t border-brass" : ""}>
          <div className="flex items-start justify-between gap-2 px-2 py-4">
            <div className="desk-status">
              <StackDate iso={device.lastPull} />
              <StackDate iso={device.lastOk} />
              <div className="flex flex-col items-center text-xs leading-tight text-ink">
                <span>{device.daily ? "يومي" : "متوقف"}</span>
                {device.daily && device.drift != null ? (
                  <>
                    <span className="text-muted">فرق</span>
                    <span dir="ltr" className="text-muted">
                      {device.drift}
                    </span>
                    <span className="text-muted">ث</span>
                  </>
                ) : null}
                {device.timeChecked ? <StackDate iso={device.timeChecked} /> : null}
              </div>
              <span className={device.error ? "text-xs leading-tight text-clay" : "text-sm text-muted"}>
                {device.error ? "خطأ" : "—"}
              </span>
            </div>
            <div className="desk-actions flex flex-col gap-2">
              <button type="button" className={ghost} disabled={busy} onClick={() => onTest(device.id)}>
                اختبار
              </button>
              <button type="button" className={solid} disabled={busy} onClick={() => onPull(device.id)}>
                سحب
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => onSync(device.id)}>
                مزامنة موظفين
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => onLink(device.id)}>
                ربط أرقام الجهاز
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => onSetTime(device.id)}>
                اضبط الوقت دلوقتي
              </button>
              <button type="button" className={ghost} disabled={busy} onClick={() => onStopDaily(device.id)}>
                {device.daily ? "وقف الضبط اليومي" : "رجّع الضبط اليومي"}
              </button>
            </div>
          </div>
          {device.error ? (
            <p className="px-4 pb-4 text-sm leading-relaxed text-clay" role="alert">
              {device.error}
            </p>
          ) : null}
          {linkOpen === device.id ? (
            <div className="mx-3 mb-4 rounded-2xl border border-line px-3 py-3">
              <p className="text-sm text-muted">أرقام الجهاز مربوطة بالاسم اللي ظهر في السحب.</p>
              {numbers.length ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {numbers.map((person) => (
                    <li key={person.no} className="flex items-center justify-between gap-3">
                      <span>{person.name}</span>
                      <span dir="ltr" className="font-mono text-brass">
                        {person.no}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-faint">لسه مفيش أرقام. اسحب الحضور الأول.</p>
              )}
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
