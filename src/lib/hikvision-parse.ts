import type { Punch } from "./attendance";

const FAIL_MINORS = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 39, 41, 44, 47, 50, 55, 58, 61, 64, 67, 70, 76, 78, 80, 102,
  106,
]);

const METHODS: Record<number, string> = {
  1: "كارت",
  2: "كارت + رقم سري",
  16: "تحقق متعدد",
  38: "بصمة / كارت",
  40: "كارت + بصمة",
  43: "كارت + بصمة + رقم",
  46: "بصمة + رقم",
  54: "وجه + بصمة",
  57: "وجه + رقم",
  60: "وجه + كارت",
  63: "وجه + رقم + بصمة",
  69: "رقم وظيفي + بصمة",
  75: "وجه",
  77: "رقم وظيفي + كلمة سر",
  101: "رقم وظيفي + كلمة سر",
  105: "بطاقة هوية",
  113: "بصمة",
};

export type PageMeta = {
  status: string;
  count: number;
  total: number | null;
};

export type ParsedPage = {
  punches: Punch[];
  meta: PageMeta;
  error?: string;
};

export type DirectoryPerson = {
  employeeNo: string;
  name: string;
};

function asList(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("Info" in record) return asList(record.Info);
    if ("UserInfo" in record) return asList(record.UserInfo);
    return [record];
  }
  return [];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&" + "lt;", "<")
    .replaceAll("&" + "gt;", ">")
    .replaceAll("&" + "quot;", '"')
    .replaceAll("&" + "apos;", "'")
    .replaceAll("&" + "amp;", "&")
    .trim();
}

function tag(block: string, name: string): string {
  const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "")) : "";
}

export function methodLabel(minor: number): string {
  return METHODS[minor] ?? (minor ? "دخول" : "");
}

export function splitStamp(raw: string): { date: string; time: string } | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?/.exec(raw.trim());
  if (!match) return null;
  return { date: match[1], time: `${match[2]}:${match[3] ?? "00"}` };
}

function punchFromRecord(record: Record<string, unknown>): Punch | null {
  const minor = Number(record.minor ?? record.minorEvent ?? 0);
  const major = Number(record.major ?? 5);
  if (major && major !== 5) return null;
  if (FAIL_MINORS.has(minor)) return null;
  const employeeNo = textOf(record.employeeNoString ?? record.employeeNo ?? record.employeeNoInt);
  const name = textOf(record.name ?? record.employeeName ?? record.personName);
  if (!employeeNo && !name) return null;
  const stamp = splitStamp(textOf(record.time ?? record.dateTime ?? record.eventTime));
  if (!stamp) return null;
  return {
    employeeNo,
    name,
    date: stamp.date,
    time: stamp.time,
    method: methodLabel(minor),
  };
}

function errorFromJson(json: Record<string, unknown>): string | undefined {
  if (json.AcsEvent || json.UserInfoSearch) return undefined;
  const status = textOf(json.statusString || json.subStatusCode || json.errorMsg);
  if (!status && json.statusCode == null) return undefined;
  return textOf(json.errorMsg) || status || "الجهاز رفض الطلب";
}

export function parseEventPayload(body: string): ParsedPage {
  const trimmed = body.trim();
  if (!trimmed) return { punches: [], meta: { status: "EMPTY", count: 0, total: 0 }, error: "الجهاز رجّع رد فاضي." };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return { punches: [], meta: { status: "BAD", count: 0, total: null }, error: "رد الجهاز مش مفهوم." };
    }
    const problem = errorFromJson(json);
    if (problem) return { punches: [], meta: { status: "ERROR", count: 0, total: null }, error: problem };
    const acs = (json.AcsEvent ?? json) as Record<string, unknown>;
    const punches = asList(acs.InfoList).map(punchFromRecord).filter((item): item is Punch => Boolean(item));
    const count = Number(acs.numOfMatches ?? punches.length);
    const totalRaw = acs.totalMatches;
    return {
      punches,
      meta: {
        status: textOf(acs.responseStatusStrg) || "OK",
        count: Number.isFinite(count) ? count : punches.length,
        total: totalRaw == null ? null : Number(totalRaw),
      },
    };
  }

  const status = tag(trimmed, "responseStatusStrg") || tag(trimmed, "statusString");
  if (/invalid content|badparameters|notsupport/i.test(trimmed) && !/<Info\b/i.test(trimmed)) {
    return {
      punches: [],
      meta: { status: "ERROR", count: 0, total: null },
      error: tag(trimmed, "statusString") || tag(trimmed, "subStatusCode") || "الجهاز رفض شكل الطلب",
    };
  }
  const punches: Punch[] = [];
  const infoRe = /<Info\b[^>]*>([\s\S]*?)<\/Info>/gi;
  let match: RegExpExecArray | null;
  while ((match = infoRe.exec(trimmed))) {
    const block = match[1];
    const punch = punchFromRecord({
      major: tag(block, "major"),
      minor: tag(block, "minor"),
      time: tag(block, "time") || tag(block, "dateTime"),
      employeeNoString: tag(block, "employeeNoString") || tag(block, "employeeNo"),
      name: tag(block, "name"),
    });
    if (punch) punches.push(punch);
  }
  const count = Number(tag(trimmed, "numOfMatches") || punches.length);
  const total = tag(trimmed, "totalMatches");
  return {
    punches,
    meta: {
      status: status || "OK",
      count: Number.isFinite(count) ? count : punches.length,
      total: total ? Number(total) : null,
    },
  };
}

export function parseUserPayload(body: string): { people: DirectoryPerson[]; meta: PageMeta; error?: string } {
  const trimmed = body.trim();
  if (!trimmed) return { people: [], meta: { status: "EMPTY", count: 0, total: 0 } };
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const problem = errorFromJson(json);
      if (problem && !json.UserInfoSearch) {
        return { people: [], meta: { status: "ERROR", count: 0, total: null }, error: problem };
      }
      const search = (json.UserInfoSearch ?? json) as Record<string, unknown>;
      const people = asList(search.UserInfo)
        .map((record) => ({
          employeeNo: textOf(record.employeeNo ?? record.employeeNoString),
          name: textOf(record.name),
        }))
        .filter((person) => person.employeeNo && person.name);
      const count = Number(search.numOfMatches ?? people.length);
      return {
        people,
        meta: {
          status: textOf(search.responseStatusStrg) || "OK",
          count: Number.isFinite(count) ? count : people.length,
          total: search.totalMatches == null ? null : Number(search.totalMatches),
        },
      };
    } catch {
      return { people: [], meta: { status: "BAD", count: 0, total: null }, error: "رد الأسماء مش مفهوم." };
    }
  }
  const people: DirectoryPerson[] = [];
  const re = /<UserInfo\b[^>]*>([\s\S]*?)<\/UserInfo>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed))) {
    const employeeNo = tag(match[1], "employeeNo") || tag(match[1], "employeeNoString");
    const name = tag(match[1], "name");
    if (employeeNo && name) people.push({ employeeNo, name });
  }
  return {
    people,
    meta: {
      status: tag(trimmed, "responseStatusStrg") || "OK",
      count: people.length,
      total: null,
    },
  };
}

export function parseDevicePayload(body: string): { name: string; model: string } {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const info = (json.DeviceInfo ?? json) as Record<string, unknown>;
      return {
        name: textOf(info.deviceName),
        model: textOf(info.model),
      };
    } catch {
      return { name: "", model: "" };
    }
  }
  return {
    name: tag(trimmed, "deviceName"),
    model: tag(trimmed, "model"),
  };
}

export function isMore(status: string): boolean {
  return status.toUpperCase().replace(/\s+/g, "_") === "MORE";
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function punchesFromPortal(payload: unknown): { punches: Punch[]; total: number | null } {
  const json = asObject(payload) ?? {};
  const nested = asObject(json.data);
  const data = nested && (Array.isArray(nested.recordList) || nested.totalNum != null) ? nested : json;
  const list = Array.isArray(data.recordList) ? data.recordList : [];
  const totalRaw = data.totalNum;
  const totalNumber = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
  const punches: Punch[] = [];
  for (const item of list) {
    const row = asObject(item);
    if (!row) continue;
    const person = asObject(row.personInfo) ?? {};
    const name = textOf(person.fullName ?? person.name ?? row.fullName ?? row.personName);
    if (!name || name === "--") continue;
    const employeeNo =
      textOf(person.personCode ?? person.employeeNo ?? row.personCode ?? row.employeeNo ?? person.id) || name;
    const stamp = splitStamp(textOf(row.deviceTime ?? row.eventTime ?? row.time ?? row.occurTime));
    if (!stamp) continue;
    punches.push({ employeeNo, name, date: stamp.date, time: stamp.time, method: "بصمة" });
  }
  return { punches, total: Number.isFinite(totalNumber) ? totalNumber : null };
}
