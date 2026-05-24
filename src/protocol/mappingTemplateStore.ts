import {
  parsePointFieldMappingTemplates,
  serializePointFieldMappingTemplates,
  type PointFieldMappingTemplate,
} from "./pointModel";

export const pointFieldMappingTemplateStorageKey = "icstudio.protocolImportWizard.pointFieldMappingTemplates";

export type PointFieldMappingTemplateStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export type PointFieldMappingTemplateRepository = {
  load: () => PointFieldMappingTemplate[];
  save: (templates: PointFieldMappingTemplate[]) => void;
  clear: () => void;
};

export function createPointFieldMappingTemplateRepository(
  storage?: PointFieldMappingTemplateStorage | null,
  key = pointFieldMappingTemplateStorageKey,
): PointFieldMappingTemplateRepository {
  return {
    load() {
      if (!storage) return [];
      const content = storage.getItem(key);
      if (!content) return [];
      try {
        return parsePointFieldMappingTemplates(content);
      } catch {
        return [];
      }
    },
    save(templates) {
      if (!storage) return;
      storage.setItem(key, serializePointFieldMappingTemplates(templates));
    },
    clear() {
      storage?.removeItem?.(key);
    },
  };
}
