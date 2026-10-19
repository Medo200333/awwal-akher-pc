import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Fingerprint, LoaderCircle, Search, Upload } from "lucide-react";
import {
  aggregate,
  applyNames,
  decodeUpload,
  demoPunches,
  formatMinutes,
  parseCsv,
  parseHtmlTable,
  tableToPunches,
  type Punch,
} from "@/lib/attendance";
import { pullChunkFn, testDeviceFn, hikLoginFn, hikPullFn } from "@/lib/hikvision.functions";
import { DeviceDesk, seedDevices, type DeskDevice } from "@/components/device-desk";
import { buildXlsx, sheetRows } from "@/lib/xlsx-io";

const STORAGE_KEY = "awwal-akher-link";
const DESK_KEY = "awwal-akher-desk";

type Source = "demo" | "device" | "file";

type SavedLink = {
  host: string;
  port: number;
  https: boolean;
  username: string;
  password?: string;
  remember: boolean;
  shift: string;
  mode?: "cloud" | "direct";
};

type Team = { id: string; name: string };

const fieldClass =
  "h-11 w-full rounded-md border border-line bg-canvas px-3 text-base text-ink outline-none focus:border-brass";

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function searchToken(): string {
  return `s${Math.random().toString(36).slice(2, 12)}`;
}

function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 18h20M14 30h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="30" r="2.4" fill="currentColor" />
    </svg>
  );
}

function Ltr({ children, mono = false }: { children: string; mono?: boolean }) {
  return (
    <span dir="ltr" className={mono ? "inline-block font-mono" : "inline-block"}>
      {children}
    </span>
  );
}

function loadSaved(): SavedLink | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLink;
    if (!parsed || typeof parsed.host !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AttendanceBoard() {
  const testDevice = useServerFn(testDeviceFn);
  const pullChunk = useServerFn(pullChunkFn);
  const hikLogin = useServerFn(hikLoginFn);
  const hikPull = useServerFn(hikPullFn);
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);
  const errorRef = useRef("");
  const noteRef = useRef("دي بيانات مثال عشان تشوف شكل الشيت. اسحب من جهازك أو ارفع ملف.");
  const skipDeskSave = useRef(true);

  const [mode, setMode] = useState<"cloud" | "direct">("cloud");
  const [cloud, setCloud] = useState<{ apiBase: string; sessionId: string; featureCode: string } | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [featureCode, setFeatureCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [needSms, setNeedSms] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(80);
  const [https, setHttps] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [shift, setShift] = useState("08:00");
  const [from, setFrom] = useState("2026-10-11");
  const [to, setTo] = useState("2026-10-17");
  const [punches, setPunches] = useState<Punch[]>(() => demoPunches());
  const [source, setSource] = useState<Source>("demo");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [query, setQuery] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState<"test" | "pull" | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("دي بيانات مثال عشان تشوف شكل الشيت. اسحب من جهازك أو ارفع ملف.");
  const [devices, setDevices] = useState<DeskDevice[]>(seedDevices);
  const [linkOpen, setLinkOpen] = useState("");

  function report(message: string) {
    errorRef.current = message;
    setError(message);
  }

  function say(message: string) {
    noteRef.current = message;
    setNotice(message);
  }

  useEffect(() => {
    const saved = loadSaved();
    const storedFeature = localStorage.getItem("awwal-akher-feature") ?? "";
    if (storedFeature) setFeatureCode(storedFeature);
    if (saved) {
      setHost(saved.host);
      setPort(saved.port || 80);
      setHttps(Boolean(saved.https));
      setUsername(saved.username || (saved.mode === "direct" ? "admin" : ""));
      setRemember(Boolean(saved.remember));
      if (saved.remember && saved.password) setPassword(saved.password);
      if (saved.shift) setShift(saved.shift);
      if (saved.mode === "direct" || saved.mode === "cloud") setMode(saved.mode);
    }
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    setFrom(isoDay(start));
    setTo(isoDay(end));
  }, []);

  useEffect(() => {
    const payload: SavedLink = {
      host,
      port,
      https,
      username,
      remember,
      shift,
      mode,
      password: remember ? password : undefined,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [host, port, https, username, password, remember, shift, mode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DESK_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DeskDevice[];
      if (Array.isArray(parsed) && parsed.length) setDevices(parsed.slice(0, 2));
    } catch {
      /* seed stays */
    }
  }, []);

  useEffect(() => {
    if (skipDeskSave.current) {
      skipDeskSave.current = false;
      return;
    }
    localStorage.setItem(DESK_KEY, JSON.stringify(devices));
  }, [devices]);

  const rows = useMemo(() => aggregate(punches, shift), [punches, shift]);
  const shown = useMemo(() => {
    const q = query.trim();
    return rows.filter((row) => {
      if (problemsOnly && !row.late && !row.missingOut) return false;
      if (!q) return true;
      return row.name.includes(q) || row.employeeNo.includes(q);
    });
  }, [rows, query, problemsOnly]);

  const people = new Set(rows.map((row) => row.employeeNo || row.name)).size;
  const lateCount = rows.filter((row) => row.late).length;
  const missingCount = rows.filter((row) => row.missingOut).length;
  const sourceText = source === "demo" ? "مثال" : source === "device" ? "من الجهاز" : "من ملف";
  const numbers = useMemo(() => {
    const map = new Map<string, string>();
    for (const punch of punches) {
      if (!punch.employeeNo || map.has(punch.employeeNo)) continue;
      map.set(punch.employeeNo, punch.name || punch.employeeNo);
    }
    return [...map.entries()].map(([no, name]) => ({ no, name }));
  }, [punches]);

  function stamp(id: string, patch: Partial<DeskDevice>) {
    setDevices((list) => list.map((device) => (device.id === id ? { ...device, ...patch } : device)));
  }

  async function testRow(id: string) {
    await onTest();
    stamp(id, { error: errorRef.current });
  }

  async function pullRow(id: string) {
    await onPull();
    const today = isoDay(new Date());
    const message = errorRef.current;
    const note = noteRef.current;
    if (note.startsWith("السحب اتوقف")) {
      stamp(id, { error: note });
      return;
    }
    if (message || note.startsWith("مفيش")) {
      stamp(id, { lastPull: today, error: message || note });
      return;
    }
    stamp(id, { lastPull: today, lastOk: today, error: "" });
  }

  function setClock(id: string) {
    stamp(id, { daily: true, drift: 0, timeChecked: isoDay(new Date()), error: "" });
    say("اتسجل ضبط الوقت على الجهاز ده. الإرسال الفعلي للساعة بيتم لو السحب من عنوان الجهاز، مش من موقع هيك-كونكت.");
  }

  function stopDaily(id: string) {
    setDevices((list) =>
      list.map((device) => (device.id === id ? { ...device, daily: !device.daily, drift: device.daily ? null : 0 } : device)),
    );
  }

  function linkBody() {
    return {
      host: host.trim(),
      port: Number(port) || 80,
      https,
      username: username.trim(),
      password,
    };
  }

  function rememberFeature(value: string) {
    if (!value) return;
    setFeatureCode(value);
    localStorage.setItem("awwal-akher-feature", value);
  }

  async function onCloudLogin() {
    report("");
    say("");
    if (!username.trim() || !password) {
      report("اكتب حساب موقع هيك-كونكت وكلمة السر.");
      return;
    }
    setBusy("test");
    try {
      const result = await hikLogin({
        data: {
          account: username.trim(),
          password,
          imageCode: captcha.trim(),
          smsCode: smsCode.trim(),
          featureCode,
        },
      });
      if (result.featureCode) rememberFeature(result.featureCode);
      if (!result.ok) {
        report(result.error);
        setCloud(null);
        setTeams([]);
        setTeamId("");
        setCaptchaImage(result.captcha ?? "");
        setNeedSms(Boolean(result.needSms));
        if (result.captcha) setCaptcha("");
        return;
      }
      setCaptcha("");
      setCaptchaImage("");
      setSmsCode("");
      setNeedSms(false);
      setCloud({ apiBase: result.apiBase, sessionId: result.sessionId, featureCode: result.featureCode });
      setTeams(result.teams);
      setTeamId(result.teams[0]?.id ?? "");
      setDeviceLabel(result.teamName);
      say(result.notice);
    } catch {
      report("الاتصال بالموقع انقطع. حاول تاني.");
    } finally {
      setBusy(null);
    }
  }

  async function onTest() {
    if (mode === "cloud") {
      await onCloudLogin();
      return;
    }
    report("");
    say("");
    if (!host.trim() || !password) {
      report("اكتب عنوان الجهاز وكلمة السر.");
      return;
    }
    setBusy("test");
    try {
      const result = await testDevice({ data: linkBody() });
      if (!result.ok) {
        report(result.error);
        setDeviceLabel("");
        return;
      }
      setDeviceLabel([result.model, result.deviceName].filter(Boolean).join(" — "));
      say("الاتصال تمام. اضغط اسحب الحضور.");
    } catch {
      report("الاتصال بالتطبيق انقطع. حاول تاني.");
    } finally {
      setBusy(null);
    }
  }

  async function onCloudPull() {
    report("");
    say("");
    if (!username.trim() || !password) {
      report("اكتب حساب موقع هيك-كونكت وكلمة السر.");
      return;
    }
    const id = runRef.current + 1;
    runRef.current = id;
    setBusy("pull");
    setProgress(0);
    let session = cloud;
    try {
      if (!session) {
        const login = await hikLogin({
          data: { account: username.trim(), password, imageCode: captcha.trim(), smsCode: smsCode.trim(), featureCode },
        });
        if (runRef.current !== id) return;
        if (login.featureCode) rememberFeature(login.featureCode);
        if (!login.ok) {
          report(login.error);
          setCaptchaImage(login.captcha ?? "");
          setNeedSms(Boolean(login.needSms));
          if (login.captcha) setCaptcha("");
          return;
        }
        setCaptcha("");
        setCaptchaImage("");
        setSmsCode("");
        setNeedSms(false);
        session = { apiBase: login.apiBase, sessionId: login.sessionId, featureCode: login.featureCode };
        setCloud(session);
        setTeams(login.teams);
        setTeamId(login.teams[0]?.id ?? "");
        setDeviceLabel(login.teamName);
      }
      const collected: Punch[] = [];
      let pageIndex = 1;
      let done = false;
      let guard = 0;
      while (!done && guard < 30) {
        if (runRef.current !== id) return;
        guard += 1;
        const result = await hikPull({
          data: {
            apiBase: session.apiBase,
            sessionId: session.sessionId,
            featureCode: session.featureCode,
            startDate: from,
            endDate: to,
            timeZone: "Africa/Cairo",
            pageIndex,
            elementIds: teams.map((team) => team.id).filter(Boolean).join(","),
          },
        });
        if (runRef.current !== id) return;
        if (!result.ok) {
          report(result.error);
          if (collected.length) {
            setPunches(collected);
            setSource("device");
          }
          return;
        }
        collected.push(...result.punches);
        pageIndex = result.pageIndex;
        done = result.done;
        setProgress(collected.length);
        setPunches(collected);
        setSource("device");
      }
      if (!collected.length) {
        say("مفيش صفوف في تقرير First In Last Out للفترة دي.");
        setPunches([]);
      } else if (!done) {
        say("اتسحب جزء من السجلات. قصّر الفترة لو محتاج الباقي.");
      } else {
        say(`اتسحب ${collected.length} بصمة من موقع هيك-كونكت.`);
      }
    } catch {
      report("الاتصال انقطع أثناء السحب.");
    } finally {
      if (runRef.current === id) setBusy(null);
    }
  }

  async function onPull() {
    if (mode === "cloud") {
      await onCloudPull();
      return;
    }
    report("");
    say("");
    if (!host.trim() || !password) {
      report("اكتب عنوان الجهاز وكلمة السر.");
      return;
    }
    const id = runRef.current + 1;
    runRef.current = id;
    setBusy("pull");
    setProgress(0);
    const collected: Punch[] = [];
    const directory = new Map<string, string>();
    let eventPos = 0;
    let userPos = 0;
    let usersDone = false;
    let variant = 0;
    let pageSize = 0;
    const eventSearchId = searchToken();
    let userSearchId = "";
    let eventsDone = false;
    let guard = 0;
    try {
      while (!eventsDone && guard < 40) {
        if (runRef.current !== id) return;
        guard += 1;
        const result = await pullChunk({
          data: {
            ...linkBody(),
            startDate: from,
            endDate: to,
            timeZone: "Africa/Cairo",
            eventSearchId,
            eventPos,
            variant,
            pageSize,
            usersDone,
            userSearchId,
            userPos,
          },
        });
        if (runRef.current !== id) return;
        if (!result.ok) {
          report(result.error);
          if (collected.length) {
            setPunches(applyNames(collected, directory));
            setSource("device");
          }
          return;
        }
        if (result.deviceName || result.model) {
          setDeviceLabel([result.model, result.deviceName].filter(Boolean).join(" — "));
        }
        for (const person of result.users) directory.set(person.employeeNo, person.name);
        collected.push(...result.punches);
        eventPos = result.eventPos;
        eventsDone = result.eventsDone;
        variant = result.variant;
        pageSize = result.pageSize;
        usersDone = result.usersDone;
        userPos = result.userPos;
        userSearchId = result.userSearchId;
        setProgress(collected.length);
        setPunches(applyNames(collected, directory));
        setSource("device");
      }
      if (!collected.length) {
        say("مفيش بصمات ناجحة في الفترة دي.");
        setPunches([]);
      } else if (!eventsDone) {
        say("اتسحب جزء من السجلات. قصّر الفترة لو محتاج الباقي.");
      } else {
        say(`اتسحب ${collected.length} بصمة، واتحسب أول وآخر يوم لكل شخص.`);
      }
    } catch {
      report("الاتصال انقطع أثناء السحب. اللي ظاهر تحت هو اللي لحق يتجاب.");
    } finally {
      if (runRef.current === id) setBusy(null);
    }
  }

  function cancelPull() {
    runRef.current += 1;
    setBusy(null);
    say("السحب اتوقف. اللي ظاهر هو اللي وصل.");
  }

  async function onUpload(file: File) {
    report("");
    say("");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      report("صيغة xls القديمة مش مدعومة. من إكسل اختار حفظ باسم xlsx أو csv.");
      return;
    }
    try {
      const parsed =
        bytes[0] === 0x50 && bytes[1] === 0x4b
          ? tableToPunches(sheetRows(bytes))
          : (() => {
              const text = decodeUpload(bytes);
              const head = text.trim().slice(0, 300).toLowerCase();
              return head.startsWith("<html") || head.includes("<table") ? parseHtmlTable(text) : parseCsv(text);
            })();
      if (!parsed.punches.length) {
        report(parsed.warnings[0] || "مفيش صفوف حضور مفهومة في الملف.");
        return;
      }
      setPunches(parsed.punches);
      setSource("file");
      setDeviceLabel(file.name);
      say(parsed.warnings[0] || `اتقرأ ${parsed.punches.length} حركة من الملف.`);
    } catch (reason) {
      report(reason instanceof Error ? reason.message : "الملف ما اتقراش.");
    }
  }

  function showDemo() {
    runRef.current += 1;
    setBusy(null);
    setPunches(demoPunches());
    setSource("demo");
    setDeviceLabel("");
    report("");
    say("رجّعت المثال. مش بيانات جهازك.");
    setProblemsOnly(false);
    setQuery("");
  }

  function downloadExcel() {
    const summary = shown.map((row) => [
      row.employeeNo,
      row.name,
      row.date,
      row.weekday,
      row.first,
      row.last,
      String(row.count),
      row.minutes == null ? "" : formatMinutes(row.minutes),
      row.hours ?? "",
      row.status,
    ]);
    const keys = new Set(shown.map((row) => `${row.employeeNo}|${row.name}|${row.date}`));
    const raw = punches
      .filter((punch) => keys.has(`${punch.employeeNo}|${punch.name}|${punch.date}`))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.name.localeCompare(b.name, "ar"))
      .map((punch) => [punch.employeeNo, punch.name, punch.date, punch.time.slice(0, 5), punch.method]);
    const bytes = buildXlsx([
      {
        name: "الحضور",
        widths: [14, 24, 14, 12, 12, 12, 14, 12, 12, 18],
        rows: [["الرقم", "الاسم", "التاريخ", "اليوم", "أول بصمة", "آخر بصمة", "عدد البصمات", "المدة", "الساعات", "الحالة"], ...summary],
      },
      {
        name: "البصمات",
        widths: [14, 24, 14, 12, 18],
        rows: [["الرقم", "الاسم", "التاريخ", "الوقت", "الطريقة"], ...raw],
      },
    ]);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `حضور-اول-واخر-${from}_${to}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-3">
            <Mark className="size-12 shrink-0 text-brass" />
            <div>
              <h1 className="text-3xl font-semibold leading-tight">أول وآخر</h1>
              <p className="mt-1 text-sm text-muted">حضور وانصراف هيكفيجن — أول بصمة وآخر بصمة لكل شخص</p>
            </div>
          </div>
          <p className="rounded-full border border-brass px-3 py-2 text-sm text-brass">{sourceText}</p>
        </header>

        <DeviceDesk
          devices={devices}
          busy={busy !== null}
          linkOpen={linkOpen}
          numbers={numbers}
          onTest={(id) => void testRow(id)}
          onPull={(id) => void pullRow(id)}
          onSync={(id) => void pullRow(id)}
          onLink={(id) => setLinkOpen((current) => (current === id ? "" : id))}
          onSetTime={setClock}
          onStopDaily={stopDaily}
        />

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="الأشخاص" value={String(people)} />
          <Stat label="الأيام" value={String(rows.length)} />
          <Stat label="متأخر عن الدوام" value={String(lateCount)} warn={lateCount > 0} />
          <Stat label="بصمة واحدة" value={String(missingCount)} warn={missingCount > 0} />
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          <section className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4 md:p-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-5 text-brass" aria-hidden="true" />
              <h2 className="text-lg font-semibold">الاتصال</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={mode === "cloud"}
                onClick={() => setMode("cloud")}
                className={
                  mode === "cloud"
                    ? "h-11 rounded-md bg-brass px-3 text-sm font-medium text-brass-ink"
                    : "h-11 rounded-md border border-line px-3 text-sm font-medium text-ink"
                }
              >
                هيك-كونكت
              </button>
              <button
                type="button"
                aria-pressed={mode === "direct"}
                onClick={() => {
                  setMode("direct");
                  if (!username) setUsername("admin");
                }}
                className={
                  mode === "direct"
                    ? "h-11 rounded-md bg-brass px-3 text-sm font-medium text-brass-ink"
                    : "h-11 rounded-md border border-line px-3 text-sm font-medium text-ink"
                }
              >
                عنوان الجهاز
              </button>
            </div>
            {mode === "direct" ? (
              <>
                <label className="flex flex-col gap-2 text-sm text-muted">
                  عنوان الجهاز
                  <input
                    className={fieldClass}
                    dir="ltr"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="192.168.1.64"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-2 text-sm text-muted">
                    البورت
                    <input
                      className={fieldClass}
                      dir="ltr"
                      inputMode="numeric"
                      value={port}
                      onChange={(event) => setPort(Number(event.target.value.replace(/\D/g, "")) || 80)}
                    />
                  </label>
                  <div className="flex flex-col gap-2 text-sm text-muted">
                    التشفير
                    <button
                      type="button"
                      role="switch"
                      aria-checked={https}
                      onClick={() => setHttps((value) => !value)}
                      className="h-11 rounded-md border border-line bg-canvas px-3 text-ink"
                    >
                      {https ? "HTTPS" : "HTTP"}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            <label className="flex flex-col gap-2 text-sm text-muted">
              {mode === "cloud" ? "حساب الموقع" : "المستخدم"}
              <input
                className={fieldClass}
                dir="ltr"
                autoComplete="username"
                placeholder={mode === "cloud" ? "يوزر أو إيميل أو موبايل" : "admin"}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">
              كلمة السر
              <input
                className={fieldClass}
                dir="ltr"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {mode === "cloud" && teams.length > 0 ? (
              <label className="flex flex-col gap-2 text-sm text-muted">
                الفريق على الموقع
                <select className={fieldClass} value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {mode === "cloud" && (needSms || smsCode) ? (
              <label className="flex flex-col gap-2 text-sm text-muted">
                كود الرسالة
                <input
                  className={fieldClass}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="الكود اللي وصل على الموبايل"
                  value={smsCode}
                  onChange={(event) => setSmsCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </label>
            ) : null}
            {mode === "cloud" && captchaImage ? (
              <label className="flex flex-col gap-2 text-sm text-muted">
                كود الصورة من الموقع
                <img src={captchaImage} alt="كود التحقق" className="h-16 w-40 rounded-md border border-line bg-white object-contain" />
                <input
                  className={fieldClass}
                  dir="ltr"
                  autoComplete="off"
                  value={captcha}
                  onChange={(event) => setCaptcha(event.target.value)}
                />
              </label>
            ) : null}
            <label className="flex min-h-11 items-center gap-3 text-sm text-muted">
              <input
                type="checkbox"
                className="size-5 accent-brass"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              احفظ كلمة السر على الجهاز ده بس
            </label>
            <button
              type="button"
              onClick={onTest}
              disabled={busy !== null}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-panel-2 px-4 font-medium text-ink disabled:opacity-50"
            >
              {busy === "test" ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {busy === "test" ? "بكلم الموقع…" : mode === "cloud" ? "ادخل على الموقع" : "اختبر الاتصال"}
            </button>
            {busy === "test" ? (
              <p className="rounded-md border border-line px-3 py-3 text-sm text-ink" role="status">
                بكلم موقع هيك-كونكت من الكمبيوتر. استنى، ممكن ياخد دقيقة. مش هيفتح صفحة جديدة.
              </p>
            ) : null}
            {error ? (
              <p className="rounded-md border border-clay px-3 py-3 text-sm text-clay" role="alert">
                {error}
              </p>
            ) : null}
            {mode === "cloud" && deviceLabel && busy !== "test" ? (
              <p className="rounded-md border border-line px-3 py-3 text-sm text-brass" role="status">
                {notice || `الدخول تم. ${deviceLabel}`}
              </p>
            ) : null}
            <p className="text-sm leading-relaxed text-faint">
              {mode === "cloud" ? (
                <>
                  نفس حساب الموقع: اختار Phone، واترك الرقم <span dir="ltr">0100xxxxxxxx</span>. لو الموقع طلب كود الرسالة، اكتبه هنا واضغط ادخل تاني.{" "}
                  <a
                    className="text-brass underline"
                    href="https://www.hik-connect.com/views/login/index.html#/portal"
                    target="_blank"
                    rel="noreferrer"
                  >
                    افتح الموقع
                  </a>
                </>
              ) : (
                "ده يوزر الجهاز نفسه، غالباً admin. ينفع لو البصمة ليها عنوان ظاهر على الإنترنت."
              )}
            </p>
          </section>

          <section className="flex flex-col gap-4 rounded-lg border border-line bg-panel p-4 md:p-6 lg:col-span-3">
            <h2 className="text-lg font-semibold">الفترة والشيت</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm text-muted">
                من
                <input className={fieldClass} dir="ltr" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-sm text-muted">
                إلى
                <input className={fieldClass} dir="ltr" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
              <label className="flex flex-col gap-2 text-sm text-muted">
                بداية الدوام
                <input className={fieldClass} dir="ltr" type="time" value={shift} onChange={(event) => setShift(event.target.value)} />
              </label>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              أول بصمة هي أقدم تسجيل في اليوم، وآخر بصمة هي أحدث تسجيل. لو الشخص بصم مرة واحدة، خانة الانصراف تفضل فاضية.
              أي بصمة بعد بداية الدوام تتعلّم متأخر.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onPull}
                disabled={busy !== null}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-brass px-4 font-medium text-brass-ink disabled:opacity-50"
              >
                {busy === "pull" ? <LoaderCircle className="spin size-4 animate-spin" /> : null}
                {busy === "pull" ? `جاري السحب… ${progress}` : "اسحب الحضور"}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy !== null}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-panel-2 px-4 font-medium text-ink disabled:opacity-50"
              >
                <Upload className="size-4" aria-hidden="true" />
                ارفع ملف
              </button>
              <button
                type="button"
                onClick={showDemo}
                className="inline-flex h-11 items-center justify-center rounded-md border border-line px-4 font-medium text-ink"
              >
                مثال
              </button>
            </div>
            {busy === "pull" ? (
              <button type="button" onClick={cancelPull} className="h-11 rounded-md text-sm text-clay">
                إيقاف السحب
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void onUpload(file);
              }}
            />
            {error ? (
              <p className="rounded-md border border-clay px-3 py-3 text-sm text-clay" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? <p className="text-sm text-muted">{notice}</p> : null}
          </section>
        </div>

        <section className="rounded-lg border border-line bg-panel p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">سجل اليوم</h2>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute top-3 right-3 size-4 text-faint" aria-hidden="true" />
                <input
                  className={`${fieldClass} pr-10`}
                  placeholder="دور بالاسم أو الرقم"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <button
                type="button"
                aria-pressed={problemsOnly}
                onClick={() => setProblemsOnly((value) => !value)}
                className={
                  problemsOnly
                    ? "h-11 rounded-md bg-clay px-4 font-medium text-brass-ink"
                    : "h-11 rounded-md border border-line px-4 font-medium text-ink"
                }
              >
                المشاكل بس
              </button>
              <button
                type="button"
                onClick={downloadExcel}
                disabled={!shown.length}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brass px-4 font-medium text-brass-ink disabled:opacity-50"
              >
                <Download className="size-4" aria-hidden="true" />
                نزّل إكسل
              </button>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="py-10 text-center text-muted">مفيش صفوف مطابقة.</p>
          ) : (
            <>
              <ul className="mt-4 flex flex-col gap-3 md:hidden">
                {shown.map((row) => (
                  <li key={`${row.employeeNo}-${row.date}-${row.name}`} className="rounded-lg border border-line bg-canvas p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-sm text-muted">
                          <Ltr>{row.employeeNo}</Ltr>
                          <span> · </span>
                          <Ltr>{row.date}</Ltr>
                          <span> · {row.weekday}</span>
                        </p>
                      </div>
                      <Status text={row.status} bad={row.late || row.missingOut} />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-faint">أول بصمة</dt>
                        <dd className="mt-1 text-base">
                          <Ltr mono>{row.first}</Ltr>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-faint">آخر بصمة</dt>
                        <dd className="mt-1 text-base">{row.last ? <Ltr mono>{row.last}</Ltr> : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-faint">المدة</dt>
                        <dd className="mt-1 text-base">
                          <Ltr mono>{formatMinutes(row.minutes)}</Ltr>
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="mt-4 hidden md:block">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="px-2 py-3 text-right font-medium">الاسم</th>
                      <th className="px-2 py-3 text-right font-medium">الرقم</th>
                      <th className="px-2 py-3 text-right font-medium">التاريخ</th>
                      <th className="px-2 py-3 text-right font-medium">أول بصمة</th>
                      <th className="px-2 py-3 text-right font-medium">آخر بصمة</th>
                      <th className="px-2 py-3 text-right font-medium">المدة</th>
                      <th className="px-2 py-3 text-right font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => (
                      <tr key={`${row.employeeNo}-${row.date}-${row.name}`} className="border-b border-line">
                        <td className="px-2 py-3">{row.name}</td>
                        <td className="px-2 py-3">
                          <Ltr mono>{row.employeeNo}</Ltr>
                        </td>
                        <td className="px-2 py-3">
                          <Ltr>{row.date}</Ltr>
                          <span className="text-faint"> {row.weekday}</span>
                        </td>
                        <td className="px-2 py-3">
                          <Ltr mono>{row.first}</Ltr>
                        </td>
                        <td className="px-2 py-3">{row.last ? <Ltr mono>{row.last}</Ltr> : "—"}</td>
                        <td className="px-2 py-3">
                          <Ltr mono>{formatMinutes(row.minutes)}</Ltr>
                        </td>
                        <td className="px-2 py-3">
                          <Status text={row.status} bad={row.late || row.missingOut} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <p className="text-sm text-muted">{label}</p>
      <p className={warn ? "mt-1 font-mono text-2xl text-clay" : "mt-1 font-mono text-2xl text-ink"}>
        <span dir="ltr">{value}</span>
      </p>
    </div>
  );
}

function Status({ text, bad }: { text: string; bad: boolean }) {
  return <span className={bad ? "text-clay" : "text-brass"}>{text}</span>;
}
