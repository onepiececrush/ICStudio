import { invoke } from "@tauri-apps/api/core";
import { mockSnapshot } from "../data/mockSnapshot";
import type { AppSnapshot } from "../types";

export async function loadSnapshot(): Promise<AppSnapshot> {
  try {
    return await invoke<AppSnapshot>("get_app_snapshot");
  } catch {
    return mockSnapshot;
  }
}
