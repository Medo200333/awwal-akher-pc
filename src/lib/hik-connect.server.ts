import { createHash, publicEncrypt, constants, randomBytes } from "node:crypto";
import { punchesFromPortal } from "./hikvision-parse";
import type { Punch } from "./attendance";

const PORTAL = "https://www.hik-connect.com";
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
  | { ok: false; error: string; captcha?: string; featureCode?: string };

export type CloudChunkRequest = {
  apiBase: string;
  sessionId: string;
  featureCode: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  pageIndex: number;
};

export type CloudChunkResult =
  | { ok: true; punches: Punch[]; pageIndex: number; done: boolean }
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
  if (/^01\d{9}$/.test(digits)) return `20${digits.slice(1)}`;
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
  return `https://${host}`;
}

function portalMessage(code: number): string {
  if (code === 1013 || code === 1014 || code === 1226) {
    return "الحساب أو كلمة السر مش زي اللي على موقع hik-connect.com. لو داخل بالموبايل اكتبه 2010xxxxxxxx.";
  }
  if (code === 1003 || code === 1005 || code === 1011 || code === 1012 || code === 1015 || code === 1101) {
    return "الموقع طالب كود الصورة. اكتبه تحت واضغط ادخل تاني.";
  }
  if (code === 1043) return "كود الصورة خلّص. اكتب الكود الجديد.";
  if (code === 1402) return "الموقع رفض تشفير كلمة السر. جرّب تاني.";
  if (code === 1406) return "الحساب ده واقف مؤقتاً. افتح الموقع وجرب تدخل منه.";
  if (code === 6002) {
    return "الموقع طالب تأكيد على الإيميل أو الموبايل. افتح hik-connect.com وسجّل دخول مرة، وبعدين ارجع هنا.";
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

export async function hikLogin(account: string, password: string, imageCode = "", featureInput = ""): Promise<CloudLogin> {
  const feature = featureCode(featureInput);
  const name = normalizeAccount(account);
  try {
    let base = PORTAL;
    let preset: { password: string; index: string } | undefined;
    let accountOnHost = name;
    let hit: LoginHit = { ok: false, error: "الدخول فشل.", code: 0 };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hit = await loginAt(base, accountOnHost, password, feature, imageCode.trim(), preset);
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
      return { ok: false, error: hit.error, featureCode: feature, captcha: image || undefined };
    }
    const team = await openTeam(hit.base, hit.sessionId, feature);
    return {
      ok: true,
      apiBase: hit.base,
      sessionId: team.sessionId,
      featureCode: feature,
      teams: team.teams,
      teamName: team.teams[0]?.name ?? "",
      notice: team.notice,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/timeout|abort/i.test(message)) return { ok: false, error: "موقع هيك-كونكت ما ردش في الوقت. جرّب تاني.", featureCode: feature };
    return { ok: false, error: message || "مش قادر أوصل لموقع هيك-كونكت.", featureCode: feature };
  }
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

export async function hikPullChunk(input: CloudChunkRequest): Promise<CloudChunkResult> {
  try {
    const days = (Date.parse(`${input.endDate}T00:00:00Z`) - Date.parse(`${input.startDate}T00:00:00Z`)) / 86_400_000;
    if (days < 0) return { ok: false, error: "تاريخ النهاية قبل البداية." };
    if (days > 30) return { ok: false, error: "اقسم الفترة. كل سحبة لحد ٣١ يوم." };
    const base = assertPortal(input.apiBase);
    const feature = featureCode(input.featureCode);
    const offset = zoneOffset(input.timeZone || "Africa/Cairo", input.startDate);
    let page = Math.max(1, input.pageIndex || 1);
    const punches: Punch[] = [];
    let done = false;
    for (let step = 0; step < PAGES_PER_CALL && !done; step += 1) {
      const body = {
        pageIndex: page,
        pageSize: PAGE_SIZE,
        searchCriteria: {
          beginTime: `${input.startDate}T00:00:00${offset}`,
          endTime: `${input.endDate}T23:59:59${offset}`,
          type: 0,
          eventTypes: "",
          elementIDs: "",
          searchType: 0,
          cardNumber: "",
          personCondition: {},
          alcoholStatus: 0,
        },
      };
      const result = await readBody(`${base}/customer/proxy/hccacs/v1/event/certificateRecords/search`, {
        method: "POST",
        headers: { ...headers(feature, input.sessionId), "Content-Type": "application/json" },
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