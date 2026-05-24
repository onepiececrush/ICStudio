import type { ProtocolSourceKind } from "./deviceProfile";

export type ImportFileType = "excel" | "csv" | "json";

export type ImportContent = string | ArrayBuffer | Uint8Array;

export type ImportedProtocolInput = {
  fileName: string;
  fileType: ImportFileType;
  content: ImportContent;
  dataSourceId?: string;
};

export type ImportedProtocolDataSource = {
  id: string;
  name: string;
  kind: "sheet" | "json" | "delimited";
  headers: string[];
  rowCount: number;
};

export type ImportedProtocolTable = {
  source: {
    fileName: string;
    kind: ProtocolSourceKind;
    dataSourceId?: string;
    dataSourceName?: string;
  };
  headers: string[];
  rows: Record<string, string>[];
  rawContent: string;
};

export function listImportedProtocolSources(input: ImportedProtocolInput): ImportedProtocolDataSource[] {
  const source = createSource(input);
  if (input.fileType === "excel" && typeof input.content !== "string") {
    const bytes = contentToBytes(input.content);
    return listExcelSources(readZipEntries(bytes), source, bytes.byteLength);
  }

  if (input.fileType === "json") {
    return listJsonSources(contentToText(input.content));
  }

  const table = parseDelimitedProtocol(contentToText(input.content), source);
  return [{ id: "default", name: input.fileName, kind: "delimited", headers: table.headers, rowCount: table.rows.length }];
}

export async function listImportedProtocolSourcesAsync(input: ImportedProtocolInput): Promise<ImportedProtocolDataSource[]> {
  const source = createSource(input);
  if (input.fileType === "excel" && typeof input.content !== "string") {
    const bytes = contentToBytes(input.content);
    return listExcelSources(await readZipEntriesAsync(bytes), source, bytes.byteLength);
  }
  return listImportedProtocolSources(input);
}

export function standardizeImportedProtocol(input: ImportedProtocolInput): ImportedProtocolTable {
  const source = createSource(input);

  if (input.fileType === "json") {
    return parseJsonProtocol(contentToText(input.content), source, input.dataSourceId);
  }

  if (input.fileType === "excel") {
    return parseExcelProtocol(input.content, source, input.dataSourceId);
  }

  return parseDelimitedProtocol(contentToText(input.content), source);
}

export async function standardizeImportedProtocolAsync(input: ImportedProtocolInput): Promise<ImportedProtocolTable> {
  const source = createSource(input);

  if (input.fileType === "json") {
    return parseJsonProtocol(contentToText(input.content), source, input.dataSourceId);
  }

  if (input.fileType === "excel") {
    return parseExcelProtocolAsync(input.content, source, input.dataSourceId);
  }

  return parseDelimitedProtocol(contentToText(input.content), source);
}

function createSource(input: ImportedProtocolInput) {
  return {
    fileName: input.fileName,
    kind: input.fileType === "excel" ? "excel" : input.fileType,
  } as const;
}

function parseJsonProtocol(content: string, source: ImportedProtocolTable["source"], dataSourceId?: string): ImportedProtocolTable {
  const parsed = JSON.parse(content) as unknown;
  const sources = collectJsonArraySources(parsed);
  const selectedSource = selectJsonArraySource(sources, dataSourceId);
  const rows = selectedSource?.rows ?? [];
  const { headers, rows: normalizedRows } = normalizeJsonRows(rows);
  const tableSource = selectedSource ? { ...source, dataSourceId: selectedSource.id, dataSourceName: selectedSource.name } : source;
  return { source: tableSource, headers, rows: normalizedRows, rawContent: content };
}

type JsonArraySource = {
  id: string;
  name: string;
  rows: unknown[];
};

function listJsonSources(content: string): ImportedProtocolDataSource[] {
  const parsed = JSON.parse(content) as unknown;
  return collectJsonArraySources(parsed).map((source) => {
    const normalized = normalizeJsonRows(source.rows);
    return {
      id: source.id,
      name: source.name,
      kind: "json" as const,
      headers: normalized.headers,
      rowCount: normalized.rows.length,
    };
  });
}

function normalizeJsonRows(rows: unknown[]) {
  const objectRows = rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null && !Array.isArray(row))
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, valueToCell(value)])));
  if (objectRows.length > 0) {
    return { headers: Array.from(new Set(objectRows.flatMap((row) => Object.keys(row)))), rows: objectRows };
  }

  const tableRows = rows.filter((row): row is unknown[] => Array.isArray(row));
  if (tableRows.length === 0) return { headers: [], rows: [] };
  const headers = tableRows[0].map(valueToCell).map((header) => header.trim()).filter(Boolean);
  const normalizedRows = tableRows.slice(1)
    .filter((row) => row.some((cell) => valueToCell(cell).trim().length > 0))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, valueToCell(row[index]).trim()])));
  return { headers, rows: normalizedRows };
}

function collectJsonArraySources(value: unknown): JsonArraySource[] {
  if (Array.isArray(value)) return [{ id: "json:$", name: "$", rows: value }];
  if (typeof value !== "object" || value === null) return [];
  return collectNestedJsonArraySources(value, []);
}

function collectNestedJsonArraySources(value: unknown, path: string[]): JsonArraySource[] {
  if (Array.isArray(value)) {
    const name = path.join(".");
    return [{ id: `json:${name}`, name, rows: value }];
  }
  if (typeof value !== "object" || value === null) return [];
  if (isJsonObjectRowMap(value)) {
    const name = path.join(".");
    return [{
      id: `json:${name}`,
      name,
      rows: Object.entries(value).map(([key, row]) => ({ ...(row as Record<string, unknown>), __key: key })),
    }];
  }
  return Object.entries(value).flatMap(([key, child]) => collectNestedJsonArraySources(child, [...path, key]));
}

function isJsonObjectRowMap(value: object) {
  const entries = Object.entries(value);
  if (entries.length === 0) return false;
  return entries.every(([, child]) => isJsonRowObject(child));
}

function isJsonRowObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).some((cell) => cell === null || cell === undefined || typeof cell !== "object");
}

function selectJsonArraySource(sources: JsonArraySource[], dataSourceId?: string) {
  if (dataSourceId) {
    return sources.find((source) => source.id === dataSourceId || source.name === dataSourceId) ?? sources[0];
  }
  return sources[0];
}

function parseExcelProtocol(content: ImportContent, source: ImportedProtocolTable["source"], dataSourceId?: string): ImportedProtocolTable {
  if (typeof content === "string") {
    return parseDelimitedProtocol(content, source);
  }

  const bytes = contentToBytes(content);
  return parseExcelBytes(readZipEntries(bytes), source, bytes.byteLength, dataSourceId);
}

async function parseExcelProtocolAsync(content: ImportContent, source: ImportedProtocolTable["source"], dataSourceId?: string): Promise<ImportedProtocolTable> {
  if (typeof content === "string") {
    return parseDelimitedProtocol(content, source);
  }

  const bytes = contentToBytes(content);
  return parseExcelBytes(await readZipEntriesAsync(bytes), source, bytes.byteLength, dataSourceId);
}

function parseExcelBytes(zipEntries: Map<string, string>, source: ImportedProtocolTable["source"], byteLength: number, dataSourceId?: string) {
  const sheets = listWorkbookSheets(zipEntries);
  const selectedSheet = selectWorkbookSheet(sheets, dataSourceId);
  const sheetEntry = selectedSheet ? zipEntries.get(selectedSheet.path) : findFirstSheet(zipEntries);
  if (!sheetEntry) {
    throw new Error("Excel 文件中未找到 xl/worksheets/sheet*.xml。当前导入器需要标准 .xlsx 工作簿。意图明确的字段映射仍在后续步骤完成。");
  }

  const sharedStrings = parseSharedStrings(zipEntries.get("xl/sharedStrings.xml") ?? "");
  const tableRows = parseWorksheet(sheetEntry, sharedStrings);
  const selectedSource = selectedSheet ? { ...source, dataSourceId: selectedSheet.id, dataSourceName: selectedSheet.name } : source;
  return rowsToTable(tableRows, selectedSource, `[xlsx ${byteLength} bytes]`);
}

function parseDelimitedProtocol(content: string, source: ImportedProtocolTable["source"]): ImportedProtocolTable {
  return rowsToTable(parseDelimitedRows(content.trim()), source, content);
}

function rowsToTable(rows: string[][], source: ImportedProtocolTable["source"], rawContent: string): ImportedProtocolTable {
  const headerIndex = detectHeaderRowIndex(rows);
  const headers = rows[headerIndex] ?? [];
  const body = rows.slice(headerIndex + 1);
  const cleanHeaders = Array.from(headers, (header) => (header ?? "").trim());
  const headerEntries = cleanHeaders
    .map((header, index) => ({ header, index }))
    .filter((entry) => entry.header.length > 0);
  const mappedRows = body
    .filter((row) => row.some((cell) => (cell ?? "").trim().length > 0))
    .filter((row) => !isCommentOrFooterRow(row, headerEntries.map((entry) => entry.index)))
    .map((row) => Object.fromEntries(headerEntries.map(({ header, index }) => [header, row[index]?.trim() ?? ""])));

  return { source, headers: headerEntries.map((entry) => entry.header), rows: mappedRows, rawContent };
}

function isCommentOrFooterRow(row: string[], mappedIndexes: number[]) {
  const mappedCells = mappedIndexes.map((index) => row[index]?.trim() ?? "");
  const nonEmptyMappedCells = mappedCells.filter(Boolean);
  if (nonEmptyMappedCells.length !== 1) return false;
  const first = nonEmptyMappedCells[0].toLowerCase();
  return first.startsWith("#")
    || first.startsWith("//")
    || first.startsWith("note:")
    || first.startsWith("notes:")
    || first.startsWith("备注:")
    || first.startsWith("说明:")
    || first.startsWith("exported by")
    || first.startsWith("generated by");
}

function parseDelimitedRows(content: string): string[][] {
  if (content.length === 0) {
    return [];
  }

  const delimiter = chooseDelimiter(content);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function readZipEntries(bytes: Uint8Array) {
  const entries = new Map<string, string>();
  let offset = 0;
  const decoder = new TextDecoder();

  while (offset + 30 <= bytes.length) {
    const entry = readLocalZipEntry(bytes, offset);
    if (!entry) break;
    if (entry.compressionMethod === 0) {
      entries.set(entry.fileName, decoder.decode(entry.data));
    } else if (entry.compressionMethod === 8) {
      throw new Error(`Excel 工作簿条目 ${entry.fileName} 使用 Deflate 压缩。请使用 standardizeImportedProtocolAsync 导入标准 .xlsx 文件。`);
    } else {
      throw new Error(`Excel 工作簿条目 ${entry.fileName} 使用不支持的压缩方式 ${entry.compressionMethod}。`);
    }
    offset = entry.nextOffset;
  }

  return entries;
}

async function readZipEntriesAsync(bytes: Uint8Array) {
  const entries = new Map<string, string>();
  let offset = 0;
  const decoder = new TextDecoder();

  while (offset + 30 <= bytes.length) {
    const entry = readLocalZipEntry(bytes, offset);
    if (!entry) break;
    if (entry.compressionMethod === 0) {
      entries.set(entry.fileName, decoder.decode(entry.data));
    } else if (entry.compressionMethod === 8) {
      entries.set(entry.fileName, decoder.decode(await inflateRaw(entry.data)));
    } else {
      throw new Error(`Excel 工作簿条目 ${entry.fileName} 使用不支持的压缩方式 ${entry.compressionMethod}。`);
    }
    offset = entry.nextOffset;
  }

  return entries;
}

function readLocalZipEntry(bytes: Uint8Array, offset: number) {
  const signature = readUint32(bytes, offset);
  if (signature !== 0x04034b50) return undefined;

  const compressionMethod = readUint16(bytes, offset + 8);
  const compressedSize = readUint32(bytes, offset + 18);
  const uncompressedSize = readUint32(bytes, offset + 22);
  const fileNameLength = readUint16(bytes, offset + 26);
  const extraLength = readUint16(bytes, offset + 28);
  const nameStart = offset + 30;
  const dataStart = nameStart + fileNameLength + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > bytes.length) return undefined;

  return {
    fileName: new TextDecoder().decode(bytes.slice(nameStart, nameStart + fileNameLength)),
    compressionMethod,
    uncompressedSize,
    data: bytes.slice(dataStart, dataEnd),
    nextOffset: dataEnd,
  };
}

async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}


function listExcelSources(zipEntries: Map<string, string>, source: ImportedProtocolTable["source"], byteLength: number): ImportedProtocolDataSource[] {
  const sharedStrings = parseSharedStrings(zipEntries.get("xl/sharedStrings.xml") ?? "");
  return listWorkbookSheets(zipEntries).map((sheet) => {
    const rows = parseWorksheet(zipEntries.get(sheet.path) ?? "", sharedStrings);
    const table = rowsToTable(rows, { ...source, dataSourceId: sheet.id, dataSourceName: sheet.name }, `[xlsx ${byteLength} bytes]`);
    return { id: sheet.id, name: sheet.name, kind: "sheet", headers: table.headers, rowCount: table.rows.length };
  });
}

type WorkbookSheet = { id: string; name: string; path: string };

function listWorkbookSheets(entries: Map<string, string>): WorkbookSheet[] {
  const workbook = entries.get("xl/workbook.xml") ?? "";
  const rels = entries.get("xl/_rels/workbook.xml.rels") ?? "";
  const relationshipTargets = new Map(matchAllTuples(rels, /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g));
  const sheets = matchAllTuples(workbook, /<sheet[^>]*name="([^"]+)"[^>]*(?:r:id|id)="([^"]+)"/g)
    .map(([name, relationshipId]) => {
      const target = relationshipTargets.get(relationshipId) ?? "";
      const path = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\.\//, "")}`;
      return { id: relationshipId, name: decodeXml(name), path };
    })
    .filter((sheet) => entries.has(sheet.path));

  if (sheets.length > 0) return sheets;
  return [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((path, index) => ({ id: `sheet${index + 1}`, name: `Sheet ${index + 1}`, path }));
}

function selectWorkbookSheet(sheets: WorkbookSheet[], dataSourceId?: string) {
  if (dataSourceId) {
    return sheets.find((sheet) => sheet.id === dataSourceId || sheet.name === dataSourceId || sheet.path === dataSourceId) ?? sheets[0];
  }
  return sheets[0];
}

function findFirstSheet(entries: Map<string, string>) {
  const sheetNames = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  return sheetNames.length > 0 ? entries.get(sheetNames[0]) : undefined;
}

function parseSharedStrings(xml: string) {
  return matchAll(xml, /<si[\s\S]*?<\/si>/g).map((si) => {
    const textNodes = matchAll(si, /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g).map((text) => decodeXml(text));
    return textNodes.join("");
  });
}

function parseWorksheet(xml: string, sharedStrings: string[]) {
  return matchAll(xml, /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g).map((rowXml) => {
    const cells: string[] = [];
    for (const match of rowXml.matchAll(/<c\b[^>]*?\/>|<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      const cellXml = match[0];
      const ref = cellXml.match(/\sr="([A-Z]+)\d+"/i)?.[1] ?? "A";
      const type = cellXml.match(/\st="([^"]+)"/i)?.[1] ?? "";
      const column = columnNameToIndex(ref);
      cells[column] = readCellValue(cellXml, type, sharedStrings);
    }
    return Array.from({ length: cells.length }, (_, index) => cells[index] ?? "");
  });
}

function readCellValue(cellXml: string, type: string, sharedStrings: string[]) {
  if (type === "inlineStr") {
    return matchAll(cellXml, /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g).map((text) => decodeXml(text)).join("");
  }

  const rawValue = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") {
    const sharedIndex = Number(rawValue);
    return sharedStrings[sharedIndex] ?? "";
  }
  return decodeXml(rawValue);
}

function columnNameToIndex(columnName: string) {
  return columnName.toUpperCase().split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}


function detectHeaderRowIndex(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;
  const scanCount = Math.min(rows.length, 30);
  for (let index = 0; index < scanCount; index += 1) {
    const row = rows[index] ?? [];
    const nonEmpty = row.map((cell) => cell.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;
    const aliases = ["地址", "寄存器", "名称", "类型", "读写", "权限", "单位", "备注", "大小", "长度", "address", "name", "type", "unit", "rw"];
    const aliasHits = nonEmpty.filter((cell) => aliases.some((alias) => cell.toLowerCase().includes(alias.toLowerCase()))).length;
    const score = nonEmpty.length * 2 + aliasHits * 8;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function matchAllTuples(value: string, pattern: RegExp): Array<[string, string]> {
  return [...value.matchAll(pattern)].map((match) => [match[1] ?? "", match[2] ?? ""]);
}

function readUint16(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function matchAll(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)].map((match) => match[1] ?? match[0]);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function chooseDelimiter(content: string) {
  const sampledLines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 30);
  const scoreDelimiter = (delimiter: string) => sampledLines.reduce((score, line) => {
    const count = (line.match(new RegExp(delimiter === "\t" ? "\\t" : delimiter, "g")) ?? []).length;
    return score + (count > 0 ? count * 4 + 1 : 0);
  }, 0);
  const commaScore = scoreDelimiter(",");
  const tabScore = scoreDelimiter("\t");
  const semicolonScore = scoreDelimiter(";");
  if (tabScore > commaScore && tabScore >= semicolonScore) return "\t";
  if (semicolonScore > commaScore) return ";";
  return ",";
}

function contentToText(content: ImportContent) {
  if (typeof content === "string") return content;
  return new TextDecoder().decode(contentToBytes(content));
}

function contentToBytes(content: ArrayBuffer | Uint8Array) {
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

function valueToCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
