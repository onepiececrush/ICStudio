import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { AppSnapshot } from "../types";
import {
  buildHistoryPersistBatch,
  type HistoryPersistBatch,
  type SnapshotPersistSummary,
  type StoredTestReport,
  type TrendAggregate,
  type TrendQueryRow,
} from "./historyCenter";

export type NativeHistoryStore = {
  dbPath: string;
};

export type NativeHistoryTrendQuery = {
  deviceId: string;
  pointId: string;
  startTime: number;
  endTime: number;
  samplingPeriodMs?: number;
  aggregate: TrendAggregate;
};

export async function initializeNativeHistoryDatabase(): Promise<NativeHistoryStore | null> {
  try {
    const appDataPath = await appDataDir();
    const dbPath = await join(appDataPath, "history-data-report-center.sqlite");
    await invoke("initialize_history_database", { dbPath });
    return { dbPath };
  } catch {
    return null;
  }
}

export async function persistSnapshotToNativeHistory(
  store: NativeHistoryStore | null,
  snapshot: AppSnapshot,
  input: { timestamp: number; operator: string; testReports?: StoredTestReport[] },
): Promise<SnapshotPersistSummary | null> {
  if (!store) return null;
  const batch = buildHistoryPersistBatch(snapshot, input);
  return writeNativeHistoryBatch(store, batch);
}

export async function writeNativeHistoryBatch(
  store: NativeHistoryStore,
  batch: HistoryPersistBatch,
): Promise<SnapshotPersistSummary> {
  return invoke<SnapshotPersistSummary>("write_history_batch", { dbPath: store.dbPath, batch });
}

export async function queryNativeHistoryTrend(
  store: NativeHistoryStore,
  query: NativeHistoryTrendQuery,
): Promise<TrendQueryRow[]> {
  return invoke<TrendQueryRow[]>("query_history_trend", { dbPath: store.dbPath, query });
}

export async function exportNativeHistoryTrendCsv(
  store: NativeHistoryStore,
  query: NativeHistoryTrendQuery,
): Promise<string> {
  return invoke<string>("export_history_trend_csv", { dbPath: store.dbPath, query });
}
