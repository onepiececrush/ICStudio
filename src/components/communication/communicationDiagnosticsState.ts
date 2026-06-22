import { useMemo, useState } from "react";
import {
  exportFramesAsCsv,
  exportFramesAsJson,
  replayFrameToSimulator,
  type DiagnosticFrameRecord,
} from "../../communication/diagnostics";
import {
  filterDiagnosticFrameViews,
  summarizeDiagnosticFrameOperations,
  type DiagnosticFrameOperationFilter,
  type DiagnosticFrameView,
  type DiagnosticFrameOperationSummary,
} from "../../communication/frameView";
import type { ReplayDraft, ReplayReceipt, ReplayTarget } from "./CommunicationDiagnosticsPanels";

export type FilterDraft = {
  unitId: string;
  functionCode: string;
  addressFrom: string;
  addressTo: string;
  keyword: string;
  operation: DiagnosticFrameOperationFilter;
};

export type FrameFilterState = {
  filters: FilterDraft;
  operationSummary: DiagnosticFrameOperationSummary;
  filteredFrames: DiagnosticFrameView[];
  filteredFrameRecords: DiagnosticFrameRecord[];
  updateFilter: <Key extends keyof FilterDraft>(key: Key, value: FilterDraft[Key]) => void;
  clearFilters: () => void;
};

export type ReplayState = {
  replay: ReplayDraft;
  receipt: ReplayReceipt | null;
  selectedFrame?: DiagnosticFrameRecord;
  setReplay: (updater: ReplayDraft | ((current: ReplayDraft) => ReplayDraft)) => void;
  runReplay: (target: ReplayTarget) => void;
};

const defaultFilters: FilterDraft = {
  unitId: "",
  functionCode: "",
  addressFrom: "",
  addressTo: "",
  keyword: "",
  operation: "all",
};

export function useFrameFilters(allFrames: DiagnosticFrameRecord[]): FrameFilterState {
  const [filters, setFilters] = useState<FilterDraft>(defaultFilters);
  const operationSummary = useMemo(() => summarizeDiagnosticFrameOperations(allFrames), [allFrames]);
  const filteredFrames = useMemo(() => filterDiagnosticFrameViews(allFrames, normalizeFilters(filters)), [allFrames, filters]);
  const filteredFrameRecords = useMemo(() => toFrameRecords(filteredFrames), [filteredFrames]);

  function updateFilter<Key extends keyof FilterDraft>(key: Key, value: FilterDraft[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(defaultFilters);
  }

  return { filters, operationSummary, filteredFrames, filteredFrameRecords, updateFilter, clearFilters };
}

export function useReplayState(allFrames: DiagnosticFrameRecord[], replayableFrames: DiagnosticFrameRecord[]): ReplayState {
  const [replay, setReplay] = useState<ReplayDraft>(() => createReplayDraft());
  const [receipt, setReceipt] = useState<ReplayReceipt | null>(null);
  const selectedFrame = findReplayFrame(allFrames, replayableFrames, replay.frameId);

  async function runReplay(target: ReplayTarget) {
    if (!selectedFrame) return;
    setReceipt(await replaySelectedFrame({ frame: selectedFrame, replay, target }));
  }

  return { replay, receipt, selectedFrame, setReplay, runReplay };
}

export function downloadJson(frames: DiagnosticFrameRecord[]) {
  downloadText("communication-diagnostics-frames.json", exportFramesAsJson(frames), "application/json;charset=utf-8");
}

export function downloadCsv(frames: DiagnosticFrameRecord[]) {
  downloadText("communication-diagnostics-frames.csv", exportFramesAsCsv(frames), "text/csv;charset=utf-8");
}

function createReplayDraft(): ReplayDraft {
  return { frameId: "frame-1", unitId: "", address: "", dataHex: "", target: "内置模拟器", continuous: false, originalInterval: true };
}

function normalizeFilters(filters: FilterDraft) {
  return {
    unitId: parseOptionalNumber(filters.unitId),
    functionCode: parseOptionalNumber(filters.functionCode),
    addressFrom: parseOptionalNumber(filters.addressFrom),
    addressTo: parseOptionalNumber(filters.addressTo),
    keyword: filters.keyword,
    operation: filters.operation,
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findReplayFrame(frames: DiagnosticFrameRecord[], replayableFrames: DiagnosticFrameRecord[], frameId: string) {
  return frames.find((frame) => frame.id === frameId) ?? replayableFrames[0] ?? frames[0];
}

function toFrameRecords(frames: DiagnosticFrameView[]): DiagnosticFrameRecord[] {
  return frames.map(toFrameRecord);
}

function toFrameRecord(frame: DiagnosticFrameView): DiagnosticFrameRecord {
  return {
    id: frame.id,
    requestId: frame.requestId,
    timestamp: frame.timestamp,
    time: frame.time,
    direction: frame.direction,
    channel: frame.channel,
    protocol: frame.protocol,
    unitId: frame.unitId,
    functionCode: frame.functionCode,
    startAddress: frame.startAddress,
    quantity: frame.quantity,
    elapsedMs: frame.elapsedMs,
    result: frame.result,
    exceptionCode: frame.exceptionCode,
    rawFrame: frame.rawFrame,
    description: frame.description,
    transactionId: frame.transactionId,
    protocolId: frame.protocolId,
    mbapLength: frame.mbapLength,
    crcValid: frame.crcValid,
  };
}

async function replaySelectedFrame(input: ReplaySelectedFrameInput): Promise<ReplayReceipt> {
  const simulatorResult = await replayFrameToSimulator(input.frame, {
    unitId: parseOptionalNumber(input.replay.unitId),
    address: parseOptionalNumber(input.replay.address),
    dataHex: input.replay.dataHex.trim() || undefined,
    sender: async (rawFrame) => ({ ok: true, rawFrame, elapsedMs: input.target === "真实设备" ? 18 : 4 }),
  });
  return {
    target: input.target,
    ok: simulatorResult.ok,
    rawFrame: simulatorResult.rawFrame,
    elapsedMs: input.target === "真实设备" ? simulatorResult.elapsedMs + 14 : simulatorResult.elapsedMs,
    error: simulatorResult.error,
    at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
  };
}

type ReplaySelectedFrameInput = {
  frame: DiagnosticFrameRecord;
  replay: ReplayDraft;
  target: ReplayTarget;
};

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
