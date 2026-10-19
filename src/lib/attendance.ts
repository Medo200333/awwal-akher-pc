export type Punch = {
  employeeNo: string;
  name: string;
  date: string;
  time: string;
  method: string;
};

export type DayRow = {
  employeeNo: string;
  name: string;
  date: string;
  weekday: string;
  first: string;
  last: string;
  count: number;
  minutes: number | null;
  hours: number | null;
  late: boolean;
  missingOut: boolean;
  status: string;
};

export type ParseResult = {
  punches: Punch[];
  mode: "events" | "summary";
  warnings: string[];
};

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const NAME_HINTS = ["name", "اسم", "الموظف", "person"];
const ID_HINTS = ["employee", "emp no", "emp id", "person id", "رقم", "كود", "id", "no."];
const WHEN_HINTS = ["time", "datetime", "date time", "وقت", "توقيت", "timestamp"];
const DATE_HINTS = ["date", "تاريخ", "يوم"];
const FIRST_HINTS = ["first", "check in", "check-in", "clock in", "on duty", "حضور", "اول", "أول", "دخول", "in time"];
const LAST_HINTS = ["last", "check out", "check-out", "clock out", "off duty", "انصراف", "اخر", "آخر", "خروج", "out time"];

export function formatMinutes(minutes: number | null): string {
  if (minutes == null || minutes < 0) return "—";
  const total = Math.max(1, minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} h`;
  return `${hours} h ${mins} min`;
}

export function weekdayName(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? "";
}

function padTime(raw: string): string {
  const parts = raw.split(":");
  const h = String(Number(parts[0] ?? 0)).padStart(2, "0");
  const m = String(Number(parts[1] ?? 0)).padStart(2, "0");
  const s = String(Number(parts[2] ?? 0)).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function toSeconds(time: string): number {
  const [h, m, s] = padTime(time).split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function normHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function hints(cell: string, list: string[]): boolean {
  const n = normHeader(cell);
  return list.some((hint) => n.includes(normHeader(hint)));
}

function columnIndex(headers: string[], list: string[], avoid = new Set<number>()): number {
  return headers.findIndex((cell, index) => !avoid.has(index) && hints(cell, list));
}

export function aggregate(punches: Punch[], shiftStart = "08:00"): DayRow[] {
  const shift = toSeconds(padTime(shiftStart || "08:00"));
  const groups = new Map<string, Punch[]>();

  for (const punch of punches) {
    if (!punch.date || !punch.time) continue;
    const clock = padTime(punch.time);
    if (clock.startsWith("00:00") || clock.startsWith("23:59")) continue;
    const key = `${punch.employeeNo || punch.name}|${punch.date}`;
    const list = groups.get(key);
    if (list) list.push(punch);
    else groups.set(key, [punch]);
  }

  const rows: DayRow[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => toSeconds(a.time) - toSeconds(b.time));
    const kept: Punch[] = [];
    for (const punch of sorted) {
      const prev = kept[kept.length - 1];
      if (prev && Math.abs(toSeconds(punch.time) - toSeconds(prev.time)) <= 45) continue;
      kept.push(punch);
    }
    if (!kept.length) continue;
    const first = kept[0];
    const lastPunch = kept[kept.length - 1];
    const missingOut = kept.length < 2;
    const last = missingOut ? "" : lastPunch.time;
    const rawMinutes = (toSeconds(last) - toSeconds(first.time)) / 60;
    const minutes = missingOut ? null : Math.max(1, Math.ceil(rawMinutes - 1e-6));
    const late = toSeconds(first.time) > shift;
    const status = missingOut && late ? "متأخر · بصمة واحدة" : missingOut ? "بصمة واحدة" : late ? "متأخر" : "منتظم";
    const name = kept.find((item) => item.name)?.name || first.name || "بدون اسم";
    rows.push({
      employeeNo: first.employeeNo,
      name,
      date: first.date,
      weekday: weekdayName(first.date),
      first: padTime(first.time).slice(0, 5),
      last: last ? padTime(last).slice(0, 5) : "",
      count: kept.length,
      minutes,
      hours: minutes == null ? null : Math.round((minutes / 60) * 100) / 100,
      late,
      missingOut,
      status,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ar"));
  return rows;
}

export function applyNames(punches: Punch[], directory: Map<string, string>): Punch[] {
  return punches.map((punch) => {
    const fromDir = punch.employeeNo ? directory.get(punch.employeeNo) : undefined;
    const name = punch.name || fromDir || (punch.employeeNo ? `موظف ${punch.employeeNo}` : "بدون اسم");
    return { ...punch, name };
  });
}

function excelSerial(value: number): { date: string; time: string } | null {
  if (!Number.isFinite(value) || value < 20_000 || value > 80_000) return null;
  const ms = Math.round((value - 25569) * 86400 * 1000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}:${ss}` };
}

export function parseDateTime(raw: string): { date: string; time: string } | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = excelSerial(Number(text));
    if (serial) return serial;
  }
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (iso) {
    const date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const time = iso[4] ? padTime(`${iso[4]}:${iso[5]}:${iso[6] ?? "0"}`) : "00:00:00";
    return { date, time };
  }
  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const day = a > 12 ? a : b > 12 ? a : a;
    const month = a > 12 ? b : b > 12 ? b : b;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const time = dmy[4] ? padTime(`${dmy[4]}:${dmy[5]}:${dmy[6] ?? "0"}`) : "00:00:00";
    return { date, time };
  }
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (timeOnly) return { date: "", time: padTime(`${timeOnly[1]}:${timeOnly[2]}:${timeOnly[3] ?? "0"}`) };
  return null;
}

function blankPunch(partial: Partial<Punch>): Punch {
  return {
    employeeNo: partial.employeeNo?.trim() ?? "",
    name: partial.name?.trim() ?? "",
    date: partial.date ?? "",
    time: partial.time ?? "",
    method: partial.method ?? "",
  };
}

export function tableToPunches(rows: string[][]): ParseResult {
  const warnings: string[] = [];
  const cleaned = rows
    .map((row) => row.map((cell) => cell.replace(/\u00a0/g, " ").trim()))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) return { punches: [], mode: "events", warnings: ["الملف فاضي."] };

  let headerAt = 0;
  for (let i = 0; i < Math.min(cleaned.length, 20); i += 1) {
    const hasName = cleaned[i].some((cell) => hints(cell, NAME_HINTS));
    const hasWhen = cleaned[i].some(
      (cell) => hints(cell, WHEN_HINTS) || hints(cell, DATE_HINTS) || hints(cell, FIRST_HINTS),
    );
    if (hasName && hasWhen) {
      headerAt = i;
      break;
    }
  }

  const headers = cleaned[headerAt];
  const used = new Set<number>();
  const nameCol = columnIndex(headers, NAME_HINTS);
  if (nameCol >= 0) used.add(nameCol);
  const idCol = columnIndex(headers, ID_HINTS, used);
  if (idCol >= 0) used.add(idCol);
  const firstCol = columnIndex(headers, FIRST_HINTS, used);
  if (firstCol >= 0) used.add(firstCol);
  const lastCol = columnIndex(headers, LAST_HINTS, used);
  if (lastCol >= 0) used.add(lastCol);
  const whenCol = columnIndex(headers, WHEN_HINTS, used);
  if (whenCol >= 0) used.add(whenCol);
  const dateCol = columnIndex(headers, DATE_HINTS, used);

  if (nameCol < 0 && idCol < 0) {
    warnings.push("مش لاقي عمود الاسم. اتأكد إن الصف الأول فيه العناوين.");
  }

  const punches: Punch[] = [];
  const body = cleaned.slice(headerAt + 1);

  if (firstCol >= 0 || lastCol >= 0) {
    for (const row of body) {
      const name = nameCol >= 0 ? row[nameCol] ?? "" : "";
      const employeeNo = idCol >= 0 ? row[idCol] ?? "" : "";
      const dateCell = dateCol >= 0 ? row[dateCol] ?? "" : "";
      const dateParsed = parseDateTime(dateCell);
      const date = dateParsed?.date || "";
      const firstRaw = firstCol >= 0 ? row[firstCol] ?? "" : "";
      const lastRaw = lastCol >= 0 ? row[lastCol] ?? "" : "";
      const firstWhen = parseDateTime(firstRaw.includes("-") || firstRaw.includes("/") ? firstRaw : `${date} ${firstRaw}`);
      const lastWhen = parseDateTime(lastRaw.includes("-") || lastRaw.includes("/") ? lastRaw : `${date} ${lastRaw}`);
      const firstDate = firstWhen?.date || date;
      const firstTime = firstWhen?.time && firstWhen.time !== "00:00:00" ? firstWhen.time : firstWhen && firstRaw ? firstWhen.time : "";
      if ((name || employeeNo) && firstDate && firstTime && firstTime !== "00:00:00") {
        punches.push(blankPunch({ employeeNo, name, date: firstDate, time: firstTime, method: "ملف" }));
      } else if ((name || employeeNo) && firstDate && parseDateTime(firstRaw)?.time) {
        const only = parseDateTime(firstRaw);
        if (only?.time) punches.push(blankPunch({ employeeNo, name, date: firstDate, time: only.time, method: "ملف" }));
      }
      const lastDate = lastWhen?.date || date;
      const lastTime = lastWhen?.time;
      if ((name || employeeNo) && lastDate && lastTime && lastTime !== "00:00:00") {
        const same =
          punches.length &&
          punches[punches.length - 1].date === lastDate &&
          punches[punches.length - 1].time === lastTime &&
          punches[punches.length - 1].employeeNo === employeeNo;
        if (!same) punches.push(blankPunch({ employeeNo, name, date: lastDate, time: lastTime, method: "ملف" }));
      }
    }
    return { punches, mode: "summary", warnings };
  }

  for (const row of body) {
    const name = nameCol >= 0 ? row[nameCol] ?? "" : row[0] ?? "";
    const employeeNo = idCol >= 0 ? row[idCol] ?? "" : "";
    const whenRaw = whenCol >= 0 ? row[whenCol] ?? "" : "";
    const dateRaw = dateCol >= 0 ? row[dateCol] ?? "" : "";
    let parsed = parseDateTime(whenRaw);
    if (parsed && !parsed.date && dateRaw) {
      const date = parseDateTime(dateRaw);
      parsed = { date: date?.date || "", time: parsed.time };
    }
    if ((!parsed || !parsed.date) && dateRaw) {
      const date = parseDateTime(dateRaw);
      const time = parsed?.time || parseDateTime(whenRaw)?.time || "";
      parsed = date ? { date: date.date, time: time || date.time } : parsed;
    }
    if (!parsed?.date || !parsed.time) continue;
    if (!name && !employeeNo) continue;
    punches.push(blankPunch({ employeeNo, name, date: parsed.date, time: parsed.time, method: "ملف" }));
  }

  if (!punches.length) warnings.push("الملف اتقرأ بس مفيش صفوف حضور مفهومة.");
  return { punches, mode: "events", warnings };
}

export function parseCsv(text: string): ParseResult {
  const src = text.replace(/^\uFEFF/, "");
  const sample = src.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const semi = (sample.match(/;/g) ?? []).length;
  const comma = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;
  const delim = tabs >= comma && tabs >= semi ? "\t" : semi > comma ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === delim) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      cell = "";
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((item) => item.trim())) rows.push(row);
  }
  return tableToPunches(rows);
}

export function parseHtmlTable(html: string): ParseResult {
  const rows: string[][] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(match[1]))) {
      cells.push(
        cell[1]
          .replace(/<[^>]+>/g, " ")
          .replaceAll("&" + "nbsp;", " ")
          .replaceAll("&" + "amp;", "&")
          .trim(),
      );
    }
    if (cells.length) rows.push(cells);
  }
  return tableToPunches(rows);
}

export function demoPunches(): Punch[] {
  const people = [
    ["1001", "أحمد عبد الرحمن"],
    ["1002", "فاطمة حسن"],
    ["1003", "محمود السيد"],
    ["1004", "نورا إبراهيم"],
    ["1005", "يوسف علي"],
    ["1006", "سارة محمد"],
    ["1007", "خالد فتحي"],
    ["1008", "هدى عبد الله"],
    ["1009", "عمر جمال"],
    ["1010", "منى صلاح"],
  ] as const;
  const days = ["2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"];
  const punches: Punch[] = [];
  const add = (no: string, name: string, date: string, time: string) => {
    punches.push({ employeeNo: no, name, date, time, method: "بصمة" });
  };

  for (const date of days) {
    for (const [no, name] of people) {
      if (no === "1009" && date === "2026-10-15") continue;
      if (no === "1003" && date === "2026-10-13") {
        add(no, name, date, "07:58:11");
        continue;
      }
      if (no === "1006" && date === "2026-10-14") {
        add(no, name, date, "08:06:40");
        continue;
      }
      const late = (no === "1002" && date === "2026-10-12") || (no === "1005" && date === "2026-10-15");
      const first = late ? (no === "1005" ? "09:06:12" : "08:21:04") : no === "1008" ? "07:41:18" : "07:54:22";
      const last = no === "1008" ? "14:46:03" : no === "1004" ? "15:12:44" : "15:03:27";
      add(no, name, date, first);
      add(no, name, date, last);
      if (no === "1001" && date === "2026-10-11") {
        add(no, name, date, "12:02:10");
        add(no, name, date, "12:41:55");
      }
    }
  }
  return punches;
}

export function decodeUpload(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}
