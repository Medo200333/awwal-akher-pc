import { createHash, publicEncrypt, constants, randomBytes } from "node:crypto";
import { punchesFromPortal } from "./hikvision-parse";
import type { Punch } from "./attendance";

const PORTAL = "https://www.hik-connect.com";
const TEAM_API = "https://ieu-team.hikcentralconnect.com/hcc";
const PAGE_SIZE = 100;
const PAGES_PER_CALL = 2;

export type PortalTeam = { id: string; name: string };

export type CloudLogin =
  | {
      ok: true;
      apiBase: string;
      sessionId: string;
      featureCode: string;
      teams: PortalTeam[];
      teamName: string;
      notice: string;
    }
  | { ok: false; error: string; captcha?: string; featureCode?: string; needSms?: boolean };

export type CloudChunkRequest = {
  apiBase: string;
  sessionId: string;
  featureCode: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  pageIndex: number;
  elementIds?: string;
};

export type CloudPerson = { employeeNo: string; name: string; photo: string };

export type CloudChunkResult =
  | { ok: true; punches: Punch[]; pageIndex: number; done: boolean; people?: CloudPerson[] }
  | { ok: false; error: string };

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function featureCode(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  if (clean.length >= 8) return clean;
  return randomBytes(16).toString("hex");
}

export function normalizeAccount(account: string): string {
  const trimmed = account.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.includes("@") || /[A-Za-z]/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/^\+/, "").replace(/\D/g, "");
  // الموقع بيبعت مفتاح الدولة + الرقم زي ما اتكتب، والصفر فضل موجود: 20 + 0100... = 200100...
  if (/^01\d{9}$/.test(digits)) return `20${digits}`;
  if (/^201\d{9}$/.test(digits)) return `200${digits.slice(2)}`;
  return digits || trimmed;
}

function assertPortal(value: string): string {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    throw new Error("عنوان موقع هيك-كونكت مش مفهوم.");
  }
  if (url.protocol !== "https:") throw new Error("عنوان موقع هيك-كونكت مش مفهوم.");
  const host = url.hostname.toLowerCase();
  const allowed =
    host === "hik-connect.com" ||
    host.endsWith(".hik-connect.com") ||
    host.endsWith(".hik-connectru.com") ||
    host.endsWith(".hikcentralconnect.com") ||
    host.endsWith(".ltspartnerconnect.com");
  if (!allowed) throw new Error("نطاق هيك-كونكت مش معروف.");
  if (host.endsWith(".hikcentralconnect.com")) {
    const path = url.pathname.replace(/\/$/, "");
    return `https://${host}${path}`;
  }
  return `https://${host}`;
}

function portalMessage(code: number): string {
  if (code === 1013 || code === 1014 || code === 1226) {
    return "الحساب أو كلمة السر مش زي اللي على موقع hik-connect.com. لو داخل بالموبايل سيبه 0100xxxxxxxx والبرنامج يضيف 20.";
  }
  if (code === 1003 || code === 1005 || code === 1011 || code === 1012 || code === 1015 || code === 1101) {
    return "الموقع طالب كود الصورة. اكتبه تحت واضغط ادخل تاني.";
  }
  if (code === 1043) return "كود الصورة خلّص. اكتب الكود الجديد.";
  if (code === 1402) return "الموقع رفض تشفير كلمة السر. جرّب تاني.";
  if (code === 1406) return "الحساب ده واقف مؤقتاً. افتح الموقع وجرب تدخل منه.";
  if (code === 6002) {
    return "الموقع بعت كود على الموبايل. اكتبه في خانة كود الرسالة واضغط ادخل تاني.";
  }
  return `موقع هيك-كونكت رفض الدخول (${code}).`;
}

function needsCaptcha(code: number): boolean {
  return code === 1003 || code === 1005 || code === 1011 || code === 1012 || code === 1015 || code === 1043 || code === 1101;
}

function headers(feature: string, sessionId?: string): Record<string, string> {
  const result: Record<string, string> = {
    clientType: "48",
    clientSource: "0",
    customno: "1000002",
    featureCode: feature,
    appId: "Hik-Connect-Portal",
    lang: "en-US",
    Accept: "application/json",
  };
  if (sessionId) {
    result.sessionId = sessionId;
    result.Cookie = `HC_sessionId=${sessionId}`;
  }
  return result;
}

async function readBody(url: string, init: RequestInit): Promise<{ status: number; json: Record<string, unknown> | null; bytes: Uint8Array; type: string }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get("content-type") ?? "";
  const text = new TextDecoder().decode(bytes.slice(0, 1_500_000));
  if (type.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return { status: response.status, json: JSON.parse(text) as Record<string, unknown>, bytes, type };
    } catch {
      return { status: response.status, json: null, bytes, type };
    }
  }
  return { status: response.status, json: null, bytes, type };
}

function metaCode(json: Record<string, unknown> | null): number | null {
  const meta = json?.meta;
  if (!meta || typeof meta !== "object") return null;
  const code = (meta as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

function pem(key: string): string {
  const body = key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

async function publicKey(base: string, feature: string): Promise<string> {
  const result = await readBody(`${base}/v3/users/publickey`, { method: "GET", headers: headers(feature) });
  const key = typeof result.json?.publicKey === "string" ? result.json.publicKey : "";
  if (!key) throw new Error("موقع هيك-كونكت ما رجّعش مفتاح الدخول.");
  return key;
}

function encryptPassword(key: string, password: string): string {
  const stamp = Math.floor(Date.now() / 1000).toString();
  const plain = `${md5(password)},${stamp}`;
  return publicEncrypt({ key: pem(key), padding: constants.RSA_PKCS1_PADDING }, Buffer.from(plain)).toString("base64");
}

async function captchaImage(base: string, account: string, feature: string): Promise<string> {
  const random = Math.floor(Math.random() * 10000);
  const result = await readBody(
    `${base}/v3/captcha?account=${encodeURIComponent(account)}&featureCode=${feature}&useGetMethod=1&random=${random}`,
    { method: "GET", headers: headers(feature) },
  );
  if (!result.bytes.length || result.json) return "";
  const kind = result.type.includes("png") ? "image/png" : "image/jpeg";
  return `data:${kind};base64,${Buffer.from(result.bytes).toString("base64")}`;
}

type LoginHit =
  | { ok: true; base: string; sessionId: string }
  | { redirect: string; account: string; password: string; index: string }
  | { ok: false; error: string; code: number };

async function loginAt(
  base: string,
  account: string,
  password: string,
  feature: string,
  imageCode: string,
  preset?: { password: string; index: string },
  smsCode = "",
): Promise<LoginHit> {
  const secret = preset?.password || encryptPassword(await publicKey(base, feature), password);
  const form = new URLSearchParams({
    account,
    password: secret,
    checkSign: "true",
    cuName: "Chrome",
    featureCode: feature,
  });
  if (imageCode) form.set("imageCode", imageCode);
  if (preset?.index) form.set("enSecretIndex", preset.index);
  if (smsCode) {
    form.set("smsCode", smsCode);
    form.set("bizType", "TERMINAL_BIND");
    form.set("msgType", "1");
  }
  const result = await readBody(`${base}/v3/users/login/v6`, {
    method: "POST",
    headers: { ...headers(feature), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const code = metaCode(result.json);
  const area = result.json?.loginArea;
  const domain =
    area && typeof area === "object"
      ? String((area as { webDomain?: unknown }).webDomain || (area as { apiDomain?: unknown }).apiDomain || "")
      : "";
  const packed = result.json?.encryptLoginInfo;
  if (code === 1100 && domain) {
    const info = packed && typeof packed === "object" ? (packed as { account?: unknown; password?: unknown; enSecretIndex?: unknown }) : {};
    return {
      redirect: assertPortal(domain),
      account: String(info.account || account),
      password: String(info.password || ""),
      index: String(info.enSecretIndex || ""),
    };
  }
  if (code === 1402) return { ok: false, error: portalMessage(1402), code };
  if (code !== 200) return { ok: false, error: portalMessage(code ?? result.status), code: code ?? result.status };
  const session = result.json?.loginSession;
  const sessionId =
    session && typeof session === "object" ? String((session as { sessionId?: unknown }).sessionId ?? "") : "";
  if (!sessionId) return { ok: false, error: "الدخول تم بس الجلسة ما رجعتش. جرّب تاني.", code: 0 };
  return { ok: true, base, sessionId };
}

function teamsFrom(json: Record<string, unknown> | null): { sessionId: string; teams: PortalTeam[] } {
  const data = json?.data && typeof json.data === "object" ? (json.data as Record<string, unknown>) : (json ?? {});
  const sessionId = String(data.sessionId ?? "");
  const list = Array.isArray(data.hcbInfoList) ? data.hcbInfoList : [];
  const teams: PortalTeam[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { systemId?: unknown; systemName?: unknown; verified?: unknown };
    const id = String(row.systemId ?? "");
    if (!id) continue;
    teams.push({ id, name: String(row.systemName || "فريق") });
  }
  const verified = list.find((item) => item && typeof item === "object" && (item as { verified?: unknown }).verified);
  if (verified && typeof verified === "object") {
    const id = String((verified as { systemId?: unknown }).systemId ?? "");
    const index = teams.findIndex((team) => team.id === id);
    if (index > 0) {
      const [team] = teams.splice(index, 1);
      teams.unshift(team);
    }
  }
  return { sessionId, teams };
}

async function openTeam(base: string, sessionId: string, feature: string): Promise<{ sessionId: string; teams: PortalTeam[]; notice: string }> {
  const result = await readBody(`${base}/customer/proxy/ccfauth/public/user/v1/account/hcb`, {
    method: "POST",
    headers: { ...headers(feature, sessionId), "Content-Type": "application/json" },
    body: "{}",
  });
  const code = metaCode(result.json);
  const errorCode = result.json?.errorCode;
  if (result.status === 401 || code === 401) return { sessionId, teams: [], notice: "الجلسة ما كملتش لحد الفريق." };
  if (typeof errorCode === "string" && errorCode !== "0") {
    return { sessionId, teams: [], notice: "الحساب دخل، بس صفحة الفريق ما فتحش." };
  }
  const parsed = teamsFrom(result.json);
  const session = parsed.sessionId || sessionId;
  if (!parsed.teams.length) {
    return {
      sessionId: session,
      teams: [],
      notice: "الحساب دخل على الموقع، بس مفيش فريق متفعّل. البصمات بتتحفظ جوه فريق على hik-connect.com.",
    };
  }
  return {
    sessionId: session,
    teams: parsed.teams,
    notice: `الموقع فتح. الفريق: ${parsed.teams[0].name}. اضغط اسحب الحضور.`,
  };
}

export async function hikLogin(account: string, password: string, imageCode = "", featureInput = "", smsCode = ""): Promise<CloudLogin> {
  const feature = featureCode(featureInput);
  const name = normalizeAccount(account);
  const codeFromPhone = smsCode.trim();
  try {
    let base = PORTAL;
    let preset: { password: string; index: string } | undefined;
    let accountOnHost = name;
    let hit: LoginHit = { ok: false, error: "الدخول فشل.", code: 0 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hit = await loginAt(base, accountOnHost, password, feature, imageCode.trim(), preset, codeFromPhone);
      if ("redirect" in hit) {
        base = hit.redirect;
        accountOnHost = hit.account || name;
        preset = hit.password ? { password: hit.password, index: hit.index } : undefined;
        continue;
      }
      if (!hit.ok && hit.code === 1402 && attempt === 0) {
        preset = undefined;
        continue;
      }
      break;
    }
    if ("redirect" in hit) return { ok: false, error: "هيك-كونكت حوّل المنطقة أكتر من مرة.", featureCode: feature };
    if (!hit.ok) {
      const image = needsCaptcha(hit.code) ? await captchaImage(base, name, feature).catch(() => "") : "";
      return {
        ok: false,
        error: hit.error,
        featureCode: feature,
        captcha: image || undefined,
        needSms: hit.code === 6002 || undefined,
      };
    }
    const gate = await enterAttendance(hit.base, hit.sessionId, name, feature, codeFromPhone);
    if (!gate.ok) return { ok: false, error: gate.error, featureCode: feature, needSms: gate.needSms };
    return {
      ok: true,
      apiBase: gate.apiBase,
      sessionId: gate.sessionId,
      featureCode: feature,
      teams: gate.teams,
      teamName: gate.teams[0]?.name ?? "",
      notice: gate.notice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "موقع هيك-كونكت ما ردش في الوقت. جرّب تاني.", featureCode: feature };
    return { ok: false, error: message || "مش قادر أوصل لموقع هيك-كونكت.", featureCode: feature };
  }
}

async function enterAttendance(
  base: string,
  sessionId: string,
  account: string,
  feature: string,
  smsCode: string,
): Promise<
  | { ok: true; apiBase: string; sessionId: string; teams: PortalTeam[]; notice: string }
  | { ok: false; error: string; needSms?: boolean }
> {
  if (smsCode) {
    await readBody(`${base}/v3/terminals`, {
      method: "POST",
      headers: { ...headers(feature, sessionId), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        msgType: "1",
        cname: "Chrome",
        featureCode: feature,
        checkcode: smsCode,
        bizType: "TERMINAL_BIND",
      }),
    });
  }
  const ticketResponse = await fetch(`${TEAM_API}/auth/security/v1/ticket/login`, {
    method: "POST",
    headers: {
      clientSource: "0",
      clientType: "48",
      lang: "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      sessionId,
    },
    body: JSON.stringify({
      loginType: 2,
      sessionId,
      account,
      chooseTenantId: "",
      twoFactorToken: smsCode,
      deviceName: "Chrome",
      terminalCode: feature,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const ticketJson = (await ticketResponse.json()) as Record<string, unknown>;
  const errorCode = String(ticketJson.errorCode ?? "");
  if (errorCode === "VMS002039") {
    if (!smsCode) {
      await readBody(`${base}/v3/users/checkcode/mt`, {
        method: "POST",
        headers: { ...headers(feature, sessionId), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ from: account, bizType: "TERMINAL_BIND" }),
      });
    }
    return {
      ok: false,
      error: smsCode
        ? "الكود اترفض. اطلب كود جديد من الموقع وابعت اللي يوصل."
        : "بوابة الاتندنس طلبت كود الرسالة. اكتبه في خانة كود الرسالة واضغط ادخل تاني.",
      needSms: true,
    };
  }
  if (errorCode && errorCode !== "0") {
    return { ok: false, error: `بوابة الاتندنس رفضت الدخول (${errorCode}).` };
  }
  const data =
    ticketJson.data && typeof ticketJson.data === "object" ? (ticketJson.data as Record<string, unknown>) : {};
  const cookie = ticketResponse.headers.getSetCookie?.().find((item) => item.startsWith("JSESSIONID="));
  const nextSession = cookie?.split(";")[0]?.slice("JSESSIONID=".length) || String(data.sessionId ?? "");
  if (!nextSession) return { ok: false, error: "البوابة فتحت بس الجلسة ما رجعتش." };
  const teamName = String(data.systemName ?? "Sky Line");
  const points = await readBody(`${TEAM_API}/hccattendance/checkPoint/v1/list`, {
    method: "POST",
    headers: {
      clientSource: "0",
      clientType: "48",
      lang: "en-US",
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: `JSESSIONID=${nextSession}`,
    },
    body: JSON.stringify({ page: 1, pageSize: 50, name: "" }),
  });
  const pointData = points.json?.data && typeof points.json.data === "object" ? (points.json.data as Record<string, unknown>) : {};
  const raw = pointData.checkPoints;
  const teams: PortalTeam[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: unknown; elementId?: unknown; name?: unknown };
      const id = String(row.elementId ?? row.id ?? "");
      const label = String(row.name ?? "جهاز");
      if (id) teams.push({ id, name: label });
    }
  }
  const notice = teams.length
    ? `اتفتح فريق ${teamName}. أجهزة الحضور: ${teams.map((team) => team.name).join("، ")}.`
    : `اتفتح فريق ${teamName}.`;
  return { ok: true, apiBase: TEAM_API, sessionId: nextSession, teams, notice };
}

function zoneOffset(timeZone: string, day: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    }).formatToParts(new Date(`${day}T12:00:00Z`));
    const name = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
    if (!match) return "+03:00";
    return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
  } catch {
    return "+03:00";
  }
}

function portalError(json: Record<string, unknown> | null, status: number): string {
  const code = metaCode(json);
  const errorCode = json?.errorCode;
  if (status === 401 || code === 401 || errorCode === "VMS002004") return "جلسة الموقع خلصت. اضغط ادخل على الموقع تاني.";
  if (typeof errorCode === "string" && errorCode !== "0") return `الموقع رفض طلب الحضور (${errorCode}).`;
  if (code != null && code !== 200 && code !== 0) return portalMessage(code);
  return "";
}

function teamHeaders(sessionId: string): Record<string, string> {
  return {
    clientSource: "0",
    clientType: "48",
    lang: "en-US",
    Accept: "application/json",
    "Content-Type": "application/json",
    Cookie: `JSESSIONID=${sessionId}`,
  };
}

type MenuNode = {
  translatedName?: string;
  name?: string;
  componentName?: string;
  reportTypeId?: number;
  children?: MenuNode[];
};

function menuNodes(value: unknown, into: MenuNode[] = []): MenuNode[] {
  if (!value || typeof value !== "object") return into;
  if (Array.isArray(value)) {
    for (const item of value) menuNodes(item, into);
    return into;
  }
  const node = value as MenuNode;
  if (node.translatedName || node.name || node.reportTypeId != null) into.push(node);
  if (Array.isArray(node.children)) menuNodes(node.children, into);
  return into;
}

function reportKind(node: MenuNode): "transaction" | "firstlast" | "" {
  const text = `${node.translatedName ?? ""} ${node.name ?? ""} ${node.componentName ?? ""}`.toLowerCase();
  if (text.includes("mobile")) return "";
  if (/\btransaction\b/.test(text) || text.includes("original")) return "transaction";
  if (/first[\s_-]*in/.test(text) && /last/.test(text) && /out/.test(text)) return "firstlast";
  return "";
}

function plainCell(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ("value" in record) return plainCell(record.value);
    if ("text" in record) return plainCell(record.text);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function pictureUrl(info: Record<string, unknown>): string {
  const direct = plainCell(info.headPicUrl || info.photoUrl || info.faceUrl || info.smallPicUrl);
  if (direct) return direct;
  const stack: unknown[] = [info];
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === "string" && (/^https?:\/\//.test(current) || current.startsWith("/")) && /pic|photo|face|head|image/i.test(current)) {
      return current;
    }
    if (current && typeof current === "object") {
      for (const value of Object.values(current as Record<string, unknown>)) stack.push(value);
    }
  }
  return "";
}

function clockOf(value: string): string | null {
  const match = /(?:^|[^\d])(\d{2}:\d{2})(?::(\d{2}))?/.exec(value);
  if (!match) return null;
  const hour = Number(match[1].slice(0, 2));
  if (hour > 23) return null;
  return `${match[1]}:${match[2] ?? "00"}`;
}

function punchesFromReport(rows: unknown[], columns: Record<string, unknown>[]): Punch[] {
  const punches: Punch[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const cells: { label: string; value: string }[] = [];
    if (columns.length) {
      for (const column of columns) {
        const name = plainCell(column.name);
        const id = plainCell(column.id);
        const label = `${plainCell(column.translatedName)} ${name} ${id}`.toLowerCase();
        const value = plainCell(row[name] ?? (id ? row[id] : undefined));
        if (value) cells.push({ label, value });
      }
    }
    if (!cells.length) {
      for (const [key, value] of Object.entries(row)) {
        const text = plainCell(value);
        if (text) cells.push({ label: key.toLowerCase(), value: text });
      }
    }
    let firstName = "";
    let lastName = "";
    let fullName = "";
    let employee = "";
    let date = "";
    const times: string[] = [];
    for (const cell of cells) {
      if (/first\s*name/.test(cell.label)) firstName = cell.value;
      else if (/last\s*name|family/.test(cell.label)) lastName = cell.value;
      else if (/(^| )name$|full\s*name|person\s*name/.test(cell.label) && !/device|depart/.test(cell.label)) fullName = cell.value;
      else if (/(^|\s)id$|person\s*code|employee|person\s*id/.test(cell.label)) employee = cell.value;
      const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cell.value);
      if (!date && dateMatch && /date|day/.test(cell.label)) date = dateMatch[1];
      const clock = clockOf(cell.value);
      const shiftBound = clock === "00:00:00" || clock === "23:59:00" || clock === "23:59:59";
      const skipLabel = /period|duration|hour|weekday|shift|valid|schedule|timetable|range|plan/.test(cell.label);
      if (clock && !shiftBound && !skipLabel && /first|last|clock|check|time|in|out|transaction/.test(cell.label)) {
        times.push(clock);
      }
    }
    if (!date) {
      for (const cell of cells) {
        const dateMatch = /(\d{4}-\d{2}-\d{2})/.exec(cell.value);
        if (dateMatch) {
          date = dateMatch[1];
          break;
        }
      }
    }
    const name = fullName || [firstName, lastName].filter(Boolean).join(" ");
    if (!name || !date || !times.length) continue;
    for (const time of times) {
      punches.push({ employeeNo: employee || name, name, date, time, method: "بصمة" });
    }
  }
  return punches;
}

async function photoData(base: string, sessionId: string, url: string): Promise<string> {
  const target = url.startsWith("/") ? `${new URL(base).origin}${url}` : url;
  if (!target.startsWith("https://")) return "";
  try {
    const response = await fetch(target, {
      headers: { Cookie: `JSESSIONID=${sessionId}`, Referer: `${new URL(base).origin}/` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return "";
    const type = (response.headers.get("content-type") ?? "").split(";")[0];
    if (!type.startsWith("image/")) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 80 || bytes.length > 180_000) return "";
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

async function fetchPeople(base: string, sessionId: string): Promise<CloudPerson[]> {
  const found: { employeeNo: string; name: string; url: string }[] = [];
  for (let page = 1; page <= 4 && found.length < 80; page += 1) {
    const result = await readBody(`${base}/ccfperson/v1/persons/search`, {
      method: "POST",
      headers: teamHeaders(sessionId),
      body: JSON.stringify({
        pageSize: 100,
        pageIndex: page,
        responseMode: 0,
        productId: "3",
        field: "FullPath,HeadPic",
        searchCriteria: { logicalOperation: 1 },
      }),
    });
    if (portalError(result.json, result.status) || !result.json) break;
    const body = (result.json.data && typeof result.json.data === "object" ? result.json.data : result.json) as Record<string, unknown>;
    const response = (body.personResponse && typeof body.personResponse === "object" ? body.personResponse : body) as Record<string, unknown>;
    const list = Array.isArray(response.personList) ? response.personList : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const info = ((item as Record<string, unknown>).personInfo ?? item) as Record<string, unknown>;
      const name = plainCell(info.fullName) || [plainCell(info.firstName), plainCell(info.lastName)].filter(Boolean).join(" ");
      const employeeNo = plainCell(info.personCode ?? info.employeeNo ?? info.id);
      if (!name && !employeeNo) continue;
      found.push({ employeeNo: employeeNo || name, name: name || employeeNo, url: pictureUrl(info) });
    }
    if (list.length < 100) break;
  }
  const withPhoto = found.slice(0, 24).filter((person) => person.url);
  const photos = new Map<string, string>();
  let cursor = 0;
  async function worker() {
    while (cursor < withPhoto.length) {
      const person = withPhoto[cursor];
      cursor += 1;
      const photo = await photoData(base, sessionId, person.url);
      if (photo) photos.set(person.employeeNo, photo);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, withPhoto.length) }, () => worker()));
  return found.map((person) => ({ employeeNo: person.employeeNo, name: person.name, photo: photos.get(person.employeeNo) ?? "" }));
}

async function pullFirstLastReport(base: string, input: CloudChunkRequest, offset: string): Promise<CloudChunkResult | null> {
  const headersForTeam = teamHeaders(input.sessionId);
  const menu = await readBody(`${base}/hccattendance/ability/v1/menu/list`, {
    method: "POST",
    headers: headersForTeam,
    body: JSON.stringify({ language: "en" }),
  });
  if (portalError(menu.json, menu.status) || !menu.json) return null;
  const payload = (menu.json.data && typeof menu.json.data === "object" ? menu.json.data : menu.json) as Record<string, unknown>;
  const nodes = menuNodes(payload.menuList ?? payload);
  const transaction = nodes.find((node) => node.reportTypeId != null && node.reportTypeId >= 0 && reportKind(node) === "transaction");
  const firstLast = nodes.find((node) => node.reportTypeId != null && node.reportTypeId >= 0 && reportKind(node) === "firstlast");
  const report = transaction ?? firstLast;
  if (!report || report.reportTypeId == null) {
    const titles = nodes.map((node) => node.translatedName || node.name).filter(Boolean).slice(0, 8).join("، ");
    return { ok: false, error: titles ? `مفيش تقرير First In Last Out. اللي ظاهر: ${titles}` : "مفيش تقرير First In Last Out في القائمة." };
  }
  const head = await readBody(`${base}/hccattendance/ability/v1/report/${report.reportTypeId}/get`, {
    method: "POST",
    headers: headersForTeam,
    body: JSON.stringify({ language: "en" }),
  });
  const headReason = portalError(head.json, head.status);
  if (headReason) return { ok: false, error: headReason };
  const headBody = (head.json?.data && typeof head.json.data === "object" ? head.json.data : head.json ?? {}) as Record<string, unknown>;
  const filters = Array.isArray(headBody.filterList) ? (headBody.filterList as Record<string, unknown>[]) : [];
  const columns = Array.isArray(headBody.columnList) ? (headBody.columnList as Record<string, unknown>[]) : [];
  const ranges = [
    `${input.startDate}T00:00:00${offset},${input.endDate}T23:59:59${offset}`,
    `${input.startDate} 00:00:00,${input.endDate} 23:59:59`,
  ];
  let page = Math.max(1, input.pageIndex || 1);
  const punches: Punch[] = [];
  let done = false;
  let range = ranges[0];
  for (let step = 0; step < PAGES_PER_CALL && !done; step += 1) {
    const filterList = filters.map((filter) => {
      const columnName = plainCell(filter.target ?? filter.columnName);
      const operation = plainCell(filter.operation) || "IN";
      const inputType = Number(filter.inputType);
      const dateFilter = inputType === 3 || inputType === 5 || /date|time/.test(columnName);
      return { columnName, operation, value: dateFilter ? range : "" };
    });
    const result = await readBody(`${base}/hccattendance/report/v1/list`, {
      method: "POST",
      headers: headersForTeam,
      body: JSON.stringify({
        page,
        pageSize: PAGE_SIZE,
        language: "en",
        reportTypeId: report.reportTypeId,
        columnIdList: [],
        filterList,
      }),
    });
    const reason = portalError(result.json, result.status);
    if (reason) return { ok: false, error: reason };
    const body = (result.json?.data && typeof result.json.data === "object" ? result.json.data : result.json ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(body.reportDataList) ? body.reportDataList : [];
    const parsed = punchesFromReport(rows, columns);
    if (!parsed.length && !punches.length && step === 0 && range === ranges[0]) {
      range = ranges[1];
      step -= 1;
      continue;
    }
    punches.push(...parsed);
    if (!rows.length || body.nextPageExists === false) done = true;
    else done = rows.length < PAGE_SIZE;
    page += 1;
  }
  return { ok: true, punches, pageIndex: page, done };
}

export async function hikPullChunk(input: CloudChunkRequest): Promise<CloudChunkResult> {
  try {
    const days = (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) / 86_400_000;
    if (days < 0) return { ok: false, error: "تاريخ النهاية قبل البداية." };
    if (days > 40) return { ok: false, error: "اقسم الفترة. كل سحبة لحد ٤٠ يوم." };
    const base = assertPortal(input.apiBase);
    const feature = featureCode(input.featureCode);
    const team = base.includes("hikcentralconnect.com");
    const offset = zoneOffset(input.timeZone || "Africa/Cairo", input.startDate);
    if (team) {
      const people = input.pageIndex <= 1 ? await fetchPeople(base, input.sessionId) : [];
      const report = await pullFirstLastReport(base, input, offset);
      if (report?.ok) return { ...report, people };
      if (report) return report;
    }
    let page = Math.max(1, input.pageIndex || 1);
    const punches: Punch[] = [];
    let done = false;
    const path = team
      ? "/hccacs/v1/event/certificateRecords/search"
      : "/customer/proxy/hccacs/v1/event/certificateRecords/search";
    const callHeaders: Record<string, string> = team
      ? {
          clientSource: "0",
          clientType: "48",
          lang: "en-US",
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `JSESSIONID=${input.sessionId}`,
        }
      : { ...headers(feature, input.sessionId), "Content-Type": "application/json" };
    for (let step = 0; step < PAGES_PER_CALL && !done; step += 1) {
      const body = {
        pageIndex: page,
        pageSize: PAGE_SIZE,
        searchCriteria: {
          beginTime: `${input.startDate}T00:00:00${offset}`,
          endTime: `${input.endDate}T23:59:59${offset}`,
          type: 0,
          eventTypes: "",
          elementIDs: input.elementIds?.trim() || "",
          searchType: 0,
          cardNumber: "",
          personCondition: {},
        },
      };
      const result = await readBody(`${base}${path}`, {
        method: "POST",
        headers: callHeaders,
        body: JSON.stringify(body),
      });
      const reason = portalError(result.json, result.status);
      if (reason) return { ok: false, error: reason };
      if (!result.json) return { ok: false, error: "رد الموقع مش مفهوم." };
      const parsed = punchesFromPortal(result.json);
      punches.push(...parsed.punches);
      const seen = page * PAGE_SIZE;
      done = parsed.punches.length === 0 || (parsed.total != null && seen >= parsed.total) || parsed.punches.length < PAGE_SIZE;
      page += 1;
    }
    return { ok: true, punches, pageIndex: page, done };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "الموقع ما ردش في الوقت. جرّب فترة أقصر." };
    return { ok: false, error: message || "السحب من موقع هيك-كونكت فشل." };
  }
}