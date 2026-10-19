import assert from "node:assert/strict";
import test from "node:test";
import { aggregate, demoPunches, parseCsv, tableToPunches } from "./attendance.ts";
import { parseEventPayload, punchesFromPortal } from "./hikvision-parse.ts";
import { buildXlsx, sheetRows } from "./xlsx-io.ts";

test("first and last punch ignore the middle and a failed face event", () => {
  const parsed = parseEventPayload(
    JSON.stringify({
      AcsEvent: {
        responseStatusStrg: "OK",
        numOfMatches: 4,
        InfoList: [
          { major: 5, minor: 113, time: "2026-10-15T08:01:07+03:00", name: "أحمد", employeeNoString: "1001" },
          { major: 5, minor: 76, time: "2026-10-15T08:02:07+03:00", name: "أحمد", employeeNoString: "1001" },
          { major: 5, minor: 75, time: "2026-10-15T12:10:00+03:00", name: "أحمد", employeeNoString: "1001" },
          { major: 5, minor: 113, time: "2026-10-15T15:04:11+03:00", name: "أحمد", employeeNoString: "1001" },
        ],
      },
    }),
  );
  assert.equal(parsed.punches.length, 3);
  const [row] = aggregate(parsed.punches, "08:00");
  assert.equal(row.first, "08:01");
  assert.equal(row.last, "15:04");
  assert.equal(row.count, 3);
  assert.equal(row.late, true);
  assert.equal(row.missingOut, false);
  assert.equal(row.hours, 7.05);
});

test("a single punch leaves checkout empty", () => {
  const [row] = aggregate(
    [{ employeeNo: "1", name: "منى", date: "2026-10-12", time: "07:40:00", method: "بصمة" }],
    "08:00",
  );
  assert.equal(row.first, "07:40");
  assert.equal(row.last, "");
  assert.equal(row.status, "بصمة واحدة");
});

test("csv summary and event export round-trip through xlsx", () => {
  const summary = parseCsv("الاسم,الرقم,التاريخ,أول بصمة,آخر بصمة\nفاطمة حسن,1002,15/10/2026,08:21,15:01\n");
  assert.equal(summary.punches.length, 2);
  const [row] = aggregate(summary.punches, "08:00");
  assert.equal(row.date, "2026-10-15");
  assert.equal(row.first, "08:21");
  assert.equal(row.last, "15:01");
  assert.equal(row.late, true);

  const bytes = buildXlsx([
    {
      name: "الحضور",
      widths: [12, 20],
      rows: [
        ["الاسم", "الوقت"],
        ["خالد فتحي", "2026-10-11 07:55:02"],
      ],
    },
  ]);
  const back = tableToPunches(sheetRows(bytes));
  assert.equal(back.punches[0]?.name, "خالد فتحي");
  assert.equal(back.punches[0]?.time.startsWith("07:55"), true);
});

test("demo has a missing checkout and a four-punch day", () => {
  const rows = aggregate(demoPunches(), "08:00");
  assert.ok(rows.some((row) => row.employeeNo === "1003" && row.missingOut));
  assert.ok(rows.some((row) => row.employeeNo === "1001" && row.count === 4 && row.first === "07:54" && row.last === "15:03"));
});

test("portal records keep the person and the device time", () => {
  const parsed = punchesFromPortal({
    recordList: [
      {
        deviceTime: "2026-10-16T08:05:11+03:00",
        personInfo: { fullName: "محمد كمال", personCode: "22" },
      },
      { deviceTime: "2026-10-16T17:40:00+03:00", personInfo: { fullName: "--", personCode: "9" } },
    ],
    totalNum: 2,
  });
  assert.equal(parsed.punches.length, 1);
  assert.equal(parsed.punches[0].name, "محمد كمال");
  assert.equal(parsed.punches[0].time, "08:05:11");
});
