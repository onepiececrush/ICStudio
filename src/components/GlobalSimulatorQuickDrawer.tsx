import { useState } from "react";
import { RadioTower, X } from "lucide-react";
import type { DeviceProfile, DeviceRegister } from "../protocol/deviceProfile";
import { formatSimulatorRegisterEditorValue } from "../simulator/registerValue";
import type { SimulatorRegisterCommitSource, SimulatorRegisterMeta, SimulatorWorkspaceState } from "../simulator/workspace";
import { SimulatorRegisterValueInput } from "./SimulatorRegisterValueInput";

type GlobalSimulatorQuickDrawerProps = {
  open: boolean;
  workspace: SimulatorWorkspaceState;
  profile: DeviceProfile | null;
  onClose: () => void;
  onRegisterCommit: (registerId: string, value: string, source?: SimulatorRegisterCommitSource) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
};

type QuickSectionProps = {
  title: string;
  helper: string;
  registers: DeviceRegister[];
  pinnedRegisterIds: string[];
  registerMeta: Record<string, SimulatorRegisterMeta>;
  onRegisterCommit: (registerId: string, value: string, source?: SimulatorRegisterCommitSource) => Promise<boolean>;
  onTogglePin: (registerId: string) => void;
};

export function GlobalSimulatorQuickDrawer({
  open,
  workspace,
  profile,
  onClose,
  onRegisterCommit,
  onTogglePin,
}: GlobalSimulatorQuickDrawerProps) {
  const [keyword, setKeyword] = useState("");
  const registers = profile?.registers ?? [];
  const pinnedRegisters = selectRegistersById(registers, workspace.pinnedRegisterIds);
  const recentRegisters = selectRegistersById(registers, workspace.recentRegisterIds);
  const filteredRegisters = filterRegisters(registers, keyword).slice(0, 12);

  return (
    <aside className={`global-frame-drawer global-simulator-drawer ${open ? "open" : ""}`} aria-label="全局模拟快调台">
      <div className="global-frame-head">
        <div>
          <span>Global Simulator Quick Adjust</span>
          <strong>模拟快调</strong>
          <small>{profile ? `${profile.name} · ${workspace.running ? "运行中" : "未启动"}` : "当前没有可用模拟设备"}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭模拟快调"><X size={17} /></button>
      </div>
      <div className="global-frame-list simulator-quick-list">
        <label className="preview-filter">
          <span>搜索地址 / 名称</span>
          <input value={keyword} placeholder="例如 14006 / active power" onChange={(event) => setKeyword(event.target.value)} />
        </label>
        <QuickSection
          title="常用快调"
          helper={pinnedRegisters.length ? `已 Pin ${pinnedRegisters.length} 个寄存器` : "在从机模拟页 Pin 常用点，这里会常驻显示"}
          registers={pinnedRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />
        <QuickSection
          title="最近修改"
          helper={recentRegisters.length ? "跨页面改值记录会出现在这里" : "还没有修改记录"}
          registers={recentRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />
        <QuickSection
          title="快速搜索结果"
          helper="默认展示当前设备前 12 个匹配寄存器"
          registers={filteredRegisters}
          pinnedRegisterIds={workspace.pinnedRegisterIds}
          registerMeta={workspace.registerMeta}
          onRegisterCommit={onRegisterCommit}
          onTogglePin={onTogglePin}
        />
      </div>
    </aside>
  );
}

function QuickSection({
  title,
  helper,
  registers,
  pinnedRegisterIds,
  registerMeta,
  onRegisterCommit,
  onTogglePin,
}: QuickSectionProps) {
  return (
    <section className="simulator-quick-section">
      <div className="simulator-quick-section-head">
        <div>
          <strong>{title}</strong>
          <small>{helper}</small>
        </div>
      </div>
      {registers.length ? renderRegisterCards({
        registers,
        pinnedRegisterIds,
        registerMeta,
        onRegisterCommit,
        onTogglePin,
      }) : <QuickEmpty helper={helper} />}
    </section>
  );
}

function renderRegisterCards(props: Omit<QuickSectionProps, "title" | "helper">) {
  return props.registers.map((register) => (
    <article className="simulator-quick-card" key={register.id}>
      <div className="simulator-quick-card-head">
        <div>
          <strong>{register.name}</strong>
          <span>{register.address} · {register.dataType} · 倍率 {register.scale || 1} · {accessLabel(register.access)}</span>
        </div>
        <button className={`pin-toggle ${props.pinnedRegisterIds.includes(register.id) ? "active" : ""}`} type="button" aria-label="切换寄存器快调置顶" onClick={() => props.onTogglePin(register.id)}>
          <RadioTower size={15} />
        </button>
      </div>
      <div className="simulator-quick-card-body">
        <SimulatorRegisterValueInput
          value={formatSimulatorRegisterEditorValue(register)}
          compact
          onCommit={(value) => props.onRegisterCommit(register.id, value, "quick-drawer")}
        />
        <small>{modifiedLabel(props.registerMeta[register.id])}</small>
      </div>
    </article>
  ));
}

function QuickEmpty({ helper }: { helper: string }) {
  return (
    <div className="global-frame-empty compact">
      <RadioTower size={22} />
      <span>{helper}</span>
    </div>
  );
}

function selectRegistersById(registers: readonly DeviceRegister[], ids: readonly string[]) {
  return ids
    .map((registerId) => registers.find((register) => register.id === registerId))
    .filter((register): register is DeviceRegister => Boolean(register));
}

function filterRegisters(registers: readonly DeviceRegister[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return [...registers];
  return registers.filter((register) => registerSearchText(register).includes(normalizedKeyword));
}

function registerSearchText(register: DeviceRegister) {
  return [
    register.address,
    register.name,
    register.dataType,
    register.group,
  ].join(" ").toLowerCase();
}

function modifiedLabel(meta?: SimulatorRegisterMeta) {
  if (!meta?.lastModifiedAt) return "尚未修改";
  return `${meta.lastModifiedAt} · ${sourceLabel(meta.lastModifiedSource)}`;
}

function accessLabel(access: string) {
  if (access === "read") return "只读";
  if (access === "write") return "只写";
  if (access === "readWrite") return "读写";
  return access;
}

function sourceLabel(source?: string) {
  if (source === "quick-drawer") return "全局快调";
  if (source === "scenario") return "场景";
  if (source === "main-table") return "寄存器表";
  return "手动";
}
