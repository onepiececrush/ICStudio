import { useMemo, useState, type ChangeEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  FileInput,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Server,
} from "lucide-react";
import { summarizeDeviceProfile, type DeviceProfile, type DeviceRegister } from "../protocol/deviceProfile";
import { importDeviceProfileFromProtocolInput } from "../protocol/quickImport";
import type { ImportFileType, ImportedProtocolInput } from "../protocol/importer";

type HostVerificationConnectionConfig = {
  host: string;
  port: number;
  unitId: number;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
};

type HostVerificationRegisterPayload = {
  registerId: string;
  name: string;
  address: number;
  functionCode: number;
  quantity: number;
  dataType: string;
  scale: number;
  offset: number;
  unit: string;
  access: string;
  group: string;
};

type HostVerificationValue = {
  registerId: string;
  name: string;
  address: number;
  functionCode: number;
  rawRegisters: number[];
  value: number | null;
  displayValue: string;
  unit: string;
  quality: "Good" | "Bad" | "Skipped" | string;
  latencyMs: number;
  timestamp: number;
  error?: string | null;
};

type HostVerificationReadSummary = {
  totalCount: number;
  readableCount: number;
  writableCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  values: HostVerificationValue[];
};

type HostVerificationWriteResult = {
  registerId: string;
  name: string;
  address: number;
  rawRegisters: number[];
  value: number;
  displayValue: string;
  readback?: HostVerificationValue | null;
};

type Notice = { tone: "info" | "success" | "error"; text: string };

const defaultConnection: HostVerificationConnectionConfig = {
  host: "127.0.0.1",
  port: 1502,
  unitId: 1,
  connectTimeoutMs: 1000,
  requestTimeoutMs: 1000,
};

export function HostVerificationWorkbench({
  profiles,
  selectedProfileId,
  onSelectProfile,
  onImportProfile,
}: {
  profiles: DeviceProfile[];
  selectedProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onImportProfile: (profile: DeviceProfile) => void;
}) {
  const [connection, setConnection] = useState<HostVerificationConnectionConfig>(defaultConnection);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [summary, setSummary] = useState<HostVerificationReadSummary | null>(null);
  const [writeValues, setWriteValues] = useState<Record<string, string>>({});
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? null;
  const profileSummary = selectedProfile ? summarizeDeviceProfile(selectedProfile) : null;
  const valuesByRegisterId = useMemo(() => {
    return new Map((summary?.values ?? []).map((value) => [value.registerId, value]));
  }, [summary]);
  const visibleRegisters = useMemo(() => {
    if (!selectedProfile) return [];
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return selectedProfile.registers;
    return selectedProfile.registers.filter((register) => [
      register.id,
      register.name,
      register.group,
      String(register.address),
      register.access,
      register.dataType,
    ].some((field) => String(field ?? "").toLowerCase().includes(normalizedKeyword)));
  }, [keyword, selectedProfile]);

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setNotice({ tone: "info", text: `正在解析 XLS 协议：${file.name}` });
    try {
      const fileType = detectFileType(file.name);
      const input: ImportedProtocolInput = {
        fileName: file.name,
        fileType,
        content: fileType === "json" || fileType === "csv" ? await file.text() : await file.arrayBuffer(),
      };
      const result = await importDeviceProfileFromProtocolInput(input, {
        name: trimFileExtension(file.name),
        version: "1.0.0",
        deviceType: "主机验证设备",
        vendor: "XLS 导入",
        communicationType: "Modbus TCP",
      });
      onImportProfile(result.profile);
      onSelectProfile(result.profile.id);
      setSummary(null);
      setNotice({ tone: "success", text: `已解析 ${result.pointCount} 个寄存器，可写 ${result.profile.registers.filter(isWritable).length} 个。` });
    } catch (error) {
      setNotice({ tone: "error", text: `XLS 解析失败：${String(error || "未知错误")}。如果是旧版 .xls，请另存为 .xlsx 后重试。` });
    } finally {
      setBusy(false);
    }
  }

  async function handleReadAll() {
    if (!selectedProfile) return;
    setBusy(true);
    setNotice({ tone: "info", text: `正在读取 ${selectedProfile.registers.length} 个寄存器定义...` });
    try {
      const nextSummary = await invoke<HostVerificationReadSummary>("host_verify_read_all_registers", {
        config: connection,
        registers: selectedProfile.registers.map(toHostRegisterPayload),
      });
      setSummary(nextSummary);
      setNotice({
        tone: nextSummary.failedCount > 0 ? "error" : "success",
        text: `读取完成：成功 ${nextSummary.successCount}，失败 ${nextSummary.failedCount}，跳过只写 ${nextSummary.skippedCount}。`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: `读取失败：${String(error || "未知错误")}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleWrite(register: DeviceRegister) {
    const value = writeValues[register.id]?.trim();
    if (!value) {
      setNotice({ tone: "error", text: `请先填写 ${register.name} 的写入值。` });
      return;
    }
    setBusy(true);
    setNotice({ tone: "info", text: `正在写入 ${register.name}=${value} ...` });
    try {
      const result = await invoke<HostVerificationWriteResult>("host_verify_write_register", {
        config: connection,
        register: toHostRegisterPayload(register),
        value,
      });
      const readback = result.readback;
      if (readback) {
        setSummary((current) => mergeReadback(current, readback));
      }
      setNotice({ tone: "success", text: `写入成功：${register.name} raw=[${result.rawRegisters.join(", ")}]${readback ? `，回读 ${readback.displayValue}` : ""}` });
    } catch (error) {
      setNotice({ tone: "error", text: `写入失败：${String(error || "未知错误")}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="host-verify-workbench">
      <header className="protocol-hero glass-panel host-verify-hero">
        <div>
          <span className="eyebrow">HOST VERIFICATION</span>
          <h1>主机验证</h1>
          <p>面向程序调试：按 XLS 解析的寄存器表读取下位机数据，并严格按 read / write 权限开放写入。</p>
        </div>
        <div className="hero-actions">
          <label className={`lab-button ${busy ? "disabled" : ""}`}>
            <FileInput size={17} />导入 XLS
            <input accept=".xlsx,.xls,.csv,.json" disabled={busy} type="file" onChange={handleImportFile} />
          </label>
          <button className="lab-button primary" disabled={busy || !selectedProfile} type="button" onClick={handleReadAll}>
            {busy ? <RefreshCw size={17} /> : <PlayCircle size={17} />}读取全部
          </button>
        </div>
      </header>

      {notice ? (
        <section className={`simulator-notice glass-panel tone-${notice.tone}`}>
          <div>
            <strong>{notice.tone === "error" ? "操作异常" : "主机验证提示"}</strong>
            <span>{notice.text}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)}>知道了</button>
        </section>
      ) : null}

      <section className="current-profile-strip glass-panel host-verify-strip">
        <ConfigField label="主机 IP" value={connection.host} onChange={(value) => setConnection((current) => ({ ...current, host: value }))} />
        <ConfigField label="端口" value={String(connection.port)} type="number" onChange={(value) => setConnection((current) => ({ ...current, port: parseInteger(value, current.port) }))} />
        <ConfigField label="Unit ID" value={String(connection.unitId)} type="number" onChange={(value) => setConnection((current) => ({ ...current, unitId: parseInteger(value, current.unitId) }))} />
        <ConfigField label="连接超时 ms" value={String(connection.connectTimeoutMs)} type="number" onChange={(value) => setConnection((current) => ({ ...current, connectTimeoutMs: parseInteger(value, current.connectTimeoutMs) }))} />
        <ConfigField label="请求超时 ms" value={String(connection.requestTimeoutMs)} type="number" onChange={(value) => setConnection((current) => ({ ...current, requestTimeoutMs: parseInteger(value, current.requestTimeoutMs) }))} />
      </section>

      <section className="host-verify-layout">
        <aside className="protocol-sidebar glass-panel">
          <h2>协议资产</h2>
          <p>导入 XLS 后会生成标准 Device Profile，主机验证和从机模拟共用同一份寄存器模型。</p>
          <div className="profile-list">
            {profiles.length ? profiles.map((profile) => (
              <button
                className={`profile-card ${profile.id === selectedProfile?.id ? "active" : ""}`}
                type="button"
                onClick={() => {
                  onSelectProfile(profile.id);
                  setSummary(null);
                }}
                key={profile.id}
              >
                <strong>{profile.name}</strong>
                <span>{profile.deviceType} · {profile.communicationType}</span>
                <small>{profile.registers.length} 点 · 可写 {profile.registers.filter(isWritable).length}</small>
              </button>
            )) : (
              <div className="global-frame-empty compact">
                <Server size={22} />
                <span>还没有协议资产，请先导入 XLS。</span>
              </div>
            )}
          </div>
        </aside>

        <main className="protocol-main-stack">
          <section className="lab-card glass-panel host-verify-summary">
            <SummaryTile label="寄存器总数" value={String(profileSummary?.registerCount ?? 0)} />
            <SummaryTile label="可读数量" value={String(profileSummary?.readableCount ?? 0)} />
            <SummaryTile label="可写数量" value={String(profileSummary?.writableCount ?? 0)} />
            <SummaryTile label="地址范围" value={profileSummary?.addressRange ?? "未导入"} />
            <SummaryTile label="最近读取" value={summary ? `${summary.successCount}/${summary.totalCount}` : "未执行"} tone={summary?.failedCount ? "danger" : "success"} />
          </section>

          <section className="lab-card glass-panel">
            <div className="simulator-table-toolbar">
              <div className="lab-section-title">
                <Save size={18} />
                <div>
                  <h2>寄存器验证表</h2>
                  <p>只读点只显示读取结果；XLS 标记为 write / readWrite 的点才允许写入。</p>
                </div>
              </div>
              <label className="preview-filter host-verify-search">
                <span><Search size={13} /> 搜索</span>
                <input value={keyword} placeholder="地址 / 名称 / 分组 / 权限" onChange={(event) => setKeyword(event.target.value)} />
              </label>
            </div>

            <div className="memory-table-wrap">
              <table className="memory-table host-verify-table">
                <thead>
                  <tr>
                    <th>地址</th>
                    <th>名称</th>
                    <th>属性</th>
                    <th>读取结果</th>
                    <th>原始寄存器</th>
                    <th>状态</th>
                    <th>写入值</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProfile ? visibleRegisters.map((register) => {
                    const value = valuesByRegisterId.get(register.id);
                    const writable = isWritable(register);
                    return (
                      <tr key={register.id}>
                        <td><code>{register.address}</code></td>
                        <td>
                          <strong>{register.name}</strong>
                          <small>{register.group || "未分组"} · {register.id}</small>
                        </td>
                        <td>
                          <span className={`host-access access-${accessClass(register.access)}`}>{accessLabel(register.access)}</span>
                          <small>{register.dataType} · {register.length || 1} word · FC{readFunctionCode(register)}</small>
                        </td>
                        <td>{value?.displayValue ?? "--"}</td>
                        <td><code>{value?.rawRegisters?.length ? value.rawRegisters.join(" ") : "--"}</code></td>
                        <td><QualityBadge value={value} register={register} /></td>
                        <td>
                          {writable ? (
                            <input
                              value={writeValues[register.id] ?? ""}
                              placeholder={String(register.currentValue ?? "写入值")}
                              onChange={(event) => setWriteValues((current) => ({ ...current, [register.id]: event.target.value }))}
                            />
                          ) : <span className="host-readonly">只读</span>}
                        </td>
                        <td>
                          <button className="mini-button" disabled={busy || !writable} type="button" onClick={() => handleWrite(register)}>
                            写入
                          </button>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={8}>
                        <div className="memory-table-empty">
                          <AlertTriangle size={18} /> 请先导入 XLS / XLSX 协议文件。
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </section>
    </section>
  );
}

function ConfigField({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <label className="host-config-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "danger" }) {
  return (
    <div className={`host-summary-tile tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QualityBadge({ value, register }: { value?: HostVerificationValue; register: DeviceRegister }) {
  if (!value && !isReadable(register)) return <span className="host-quality skipped">只写跳过</span>;
  if (!value) return <span className="host-quality idle">未读取</span>;
  if (value.quality === "Good") return <span className="host-quality good">Good</span>;
  if (value.quality === "Skipped") return <span className="host-quality skipped">Skipped</span>;
  return <span className="host-quality bad" title={value.error ?? undefined}>Bad</span>;
}

function toHostRegisterPayload(register: DeviceRegister): HostVerificationRegisterPayload {
  return {
    registerId: register.id,
    name: register.name,
    address: register.address,
    functionCode: readFunctionCode(register),
    quantity: register.length || defaultQuantity(register.dataType),
    dataType: register.dataType,
    scale: register.scale || 1,
    offset: register.offset ?? 0,
    unit: register.unit,
    access: register.access,
    group: register.group,
  };
}

function mergeReadback(current: HostVerificationReadSummary | null, readback: HostVerificationValue): HostVerificationReadSummary {
  if (!current) {
    return {
      totalCount: 1,
      readableCount: 1,
      writableCount: 1,
      successCount: readback.quality === "Good" ? 1 : 0,
      failedCount: readback.quality === "Bad" ? 1 : 0,
      skippedCount: readback.quality === "Skipped" ? 1 : 0,
      values: [readback],
    };
  }
  const nextValues = [
    readback,
    ...current.values.filter((value) => value.registerId !== readback.registerId),
  ];
  return {
    ...current,
    values: nextValues,
    successCount: nextValues.filter((value) => value.quality === "Good").length,
    failedCount: nextValues.filter((value) => value.quality === "Bad").length,
    skippedCount: nextValues.filter((value) => value.quality === "Skipped").length,
  };
}

function isReadable(register: DeviceRegister) {
  const access = normalizeAccess(register.access);
  return access === "read" || access === "readWrite";
}

function isWritable(register: DeviceRegister) {
  const access = normalizeAccess(register.access);
  return access === "write" || access === "readWrite";
}

function normalizeAccess(access: string) {
  const compact = String(access).trim().toLowerCase().replace(/[\/_\-\s]/g, "");
  if (["r", "ro", "readonly", "read"].includes(compact)) return "read";
  if (["w", "wo", "writeonly", "write"].includes(compact)) return "write";
  if (["rw", "wr", "readwrite", "writeread"].includes(compact)) return "readWrite";
  return access;
}

function accessLabel(access: string) {
  const normalized = normalizeAccess(access);
  if (normalized === "read") return "只读";
  if (normalized === "write") return "只写";
  if (normalized === "readWrite") return "读写";
  return access;
}

function accessClass(access: string) {
  return normalizeAccess(access).toLowerCase();
}

function readFunctionCode(register: DeviceRegister) {
  return register.functionCode === 4 ? 4 : 3;
}

function defaultQuantity(dataType: string) {
  return ["uint32", "int32", "float32", "float"].includes(dataType.toLowerCase()) ? 2 : 1;
}

function parseInteger(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function detectFileType(fileName: string): ImportFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  return "excel";
}

function trimFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "主机验证协议";
}
