import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type SheetSpec = {
  name: string;
  widths: number[];
  rows: (string | number)[][];
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function colName(index: number): string {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows: (string | number)[][], widths: number[], shared: Map<string, number>): string {
  const cols = widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${colName(colIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? 1 : 0;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
          }
          const text = value == null ? "" : String(value);
          if (!text) return "";
          let id = shared.get(text);
          if (id == null) {
            id = shared.size;
            shared.set(text, id);
          }
          return `<c r="${ref}" t="s" s="${style}"><v>${id}</v></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${body}</sheetData>
</worksheet>`;
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const shared = new Map<string, number>();
  const sheetXmls = sheets.map((sheet) => sheetXml(sheet.rows, sheet.widths, shared));
  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.size}" uniqueCount="${shared.size}">
${[...shared.keys()].map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`).join("")}
</sst>`;
  const overrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("");
  const sheetRels = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("");
  const styleId = sheets.length + 1;
  const sheetTags = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${overrides}
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetTags}</sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${styleId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1C1408"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0B15A"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment readingOrder="2"/></xf>
  </cellXfs>
</styleSheet>`),
    "xl/sharedStrings.xml": strToU8(sharedXml),
  };

  sheetXmls.forEach((xml, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(xml);
  });
  return zipSync(files);
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&" + "lt;", "<")
    .replaceAll("&" + "gt;", ">")
    .replaceAll("&" + "quot;", '"')
    .replaceAll("&" + "apos;", "'")
    .replaceAll("&" + "amp;", "&");
}

function sharedStrings(xml: string): string[] {
  const values: string[] = [];
  const itemRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml))) {
    const parts = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    values.push(parts.join(""));
  }
  return values;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return Math.max(0, n - 1);
}

export function sheetRows(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("الملف مش إكسل xlsx سليم.");
  }
  const names = Object.keys(files);
  const sheetName =
    names.find((name) => /xl\/worksheets\/sheet1\.xml$/i.test(name)) ??
    names.find((name) => /xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetName) throw new Error("مش لاقي شيت جوه الملف.");
  const sstName = names.find((name) => /xl\/sharedstrings\.xml$/i.test(name));
  const shared = sstName ? sharedStrings(strFromU8(files[sstName])) : [];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: { col: number; value: string }[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    let fallback = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = /r="([A-Z]+)/i.exec(attrs)?.[1]?.toUpperCase() ?? "";
      const col = ref ? columnIndex(ref) : fallback;
      fallback = col + 1;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      let value = "";
      if (type === "s") {
        const id = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
        value = shared[id] ?? "";
      } else if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1])).join("");
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "");
      }
      cells.push({ col, value });
    }
    if (!cells.length) continue;
    const line = Array(Math.max(...cells.map((cell) => cell.col)) + 1).fill("");
    for (const cell of cells) line[cell.col] = cell.value;
    rows.push(line);
  }
  return rows;
}
