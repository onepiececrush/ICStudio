import type { DeviceProfile } from "./deviceProfile";
import { listImportedProtocolSourcesAsync, standardizeImportedProtocolAsync, type ImportedProtocolDataSource, type ImportedProtocolInput } from "./importer";
import { createPointFieldMapping, generateProtocolImportArtifacts, validatePointModels } from "./pointModel";
import { createDeviceProfileFromPointArtifacts, type DeviceProfileImportMeta } from "./profileImport";

export type QuickProtocolImportResult = {
  profile: DeviceProfile;
  dataSource: ImportedProtocolDataSource | undefined;
  pointCount: number;
  warningCount: number;
};

export async function importDeviceProfileFromProtocolInput(
  input: ImportedProtocolInput,
  meta: DeviceProfileImportMeta,
): Promise<QuickProtocolImportResult> {
  const sources = await listImportedProtocolSourcesAsync(input);
  const dataSource = choosePreferredDataSource(sources);
  const table = await standardizeImportedProtocolAsync({ ...input, dataSourceId: dataSource?.id });
  const artifacts = generateProtocolImportArtifacts(
    {
      protocolId: `protocol-${slugId(meta.name)}-${table.rows.length}`,
      name: meta.name,
      version: meta.version,
      deviceType: meta.deviceType,
      vendor: meta.vendor,
      sourceFile: table.source.fileName,
    },
    table,
    createPointFieldMapping(table.headers),
  );
  const validation = validatePointModels(artifacts.pointModels);
  if (!validation.canImport) {
    const firstError = validation.items.find((item) => item.severity === "error");
    throw new Error(firstError?.message ?? "协议校验未通过，无法导入从机模拟。");
  }

  return {
    profile: createDeviceProfileFromPointArtifacts(meta, artifacts),
    dataSource,
    pointCount: artifacts.pointModels.length,
    warningCount: validation.items.filter((item) => item.severity === "warning").length,
  };
}

function choosePreferredDataSource(sources: ImportedProtocolDataSource[]) {
  return [...sources].sort((left, right) => scoreDataSource(right) - scoreDataSource(left))[0];
}

function scoreDataSource(source: ImportedProtocolDataSource) {
  const headerText = source.headers.join(" ").toLowerCase();
  const aliasScore = ["地址", "寄存器", "名称", "类型", "读写", "权限", "单位", "备注", "address", "name", "type", "rw", "unit"]
    .filter((alias) => headerText.includes(alias.toLowerCase())).length;
  return aliasScore * 1000 + source.rowCount;
}

function slugId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "import";
}
