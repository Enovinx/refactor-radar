import * as vscode from 'vscode';
import { DEFAULT_LANGUAGE_CONFIGS } from './fileTrackerDefaults';
import { FileCacheEntry, IgnoreEntry, LanguageConfig, ScanSettings } from './fileTrackerTypes';
import { normalizeFolderPath } from './fileTrackerPathUtils';

export function loadConfigs(context: vscode.ExtensionContext): LanguageConfig[] {
  const saved = context.workspaceState.get<LanguageConfig[]>('languageConfigs');
  if (saved && saved.length > 0) {
    return saved;
  }

  return DEFAULT_LANGUAGE_CONFIGS.map(config => ({ ...config, isCustom: false }));
}

export function saveConfigs(context: vscode.ExtensionContext, configs: LanguageConfig[]): void {
  void context.workspaceState.update('languageConfigs', configs);
}

export function loadPromptTemplate(context: vscode.ExtensionContext): string {
  return context.workspaceState.get<string>('promptTemplate', '');
}

export function savePromptTemplate(context: vscode.ExtensionContext, template: string): void {
  void context.workspaceState.update('promptTemplate', template);
}

export function loadBatchPromptTemplate(context: vscode.ExtensionContext): string {
  return context.workspaceState.get<string>('batchPromptTemplate', '');
}

export function saveBatchPromptTemplate(context: vscode.ExtensionContext, template: string): void {
  void context.workspaceState.update('batchPromptTemplate', template);
}

export function loadScanSettings(context: vscode.ExtensionContext): ScanSettings {
  const saved = context.workspaceState.get<Partial<ScanSettings>>('scanSettings', {});
  return {
    ignoreGitIgnore: saved.ignoreGitIgnore ?? true,
    maxFilesToScan:
      typeof saved.maxFilesToScan === 'number' && saved.maxFilesToScan > 0
        ? Math.floor(saved.maxFilesToScan)
        : null,
    ignoredFolders: Array.isArray(saved.ignoredFolders)
      ? saved.ignoredFolders.filter(Boolean).map(folder => normalizeFolderPath(folder))
      : [],
    hideFolders: saved.hideFolders ?? false,
    hideFoldersWhileSearching: saved.hideFoldersWhileSearching ?? true,
  };
}

export function saveScanSettings(context: vscode.ExtensionContext, scanSettings: ScanSettings): void {
  void context.workspaceState.update('scanSettings', scanSettings);
}

export function loadIgnoredFiles(context: vscode.ExtensionContext): Map<string, IgnoreEntry> {
  const saved = context.workspaceState.get<Record<string, IgnoreEntry>>('ignoredFiles', {});
  return new Map(Object.entries(saved));
}

export function saveIgnoredFiles(context: vscode.ExtensionContext, ignoreMap: Map<string, IgnoreEntry>): void {
  const serialized = Object.fromEntries(ignoreMap.entries());
  void context.workspaceState.update('ignoredFiles', serialized);
}

export function loadFileCache(context: vscode.ExtensionContext): {
  byPath: Map<string, FileCacheEntry>;
  byIdentity: Map<string, FileCacheEntry>;
} {
  const saved = context.workspaceState.get<{
    byPath?: Record<string, FileCacheEntry>;
    byIdentity?: Record<string, FileCacheEntry>;
  }>('fileCache', {});

  return {
    byPath: new Map(Object.entries(saved.byPath || {})),
    byIdentity: new Map(Object.entries(saved.byIdentity || {})),
  };
}

export function saveFileCache(
  context: vscode.ExtensionContext,
  byPath: Map<string, FileCacheEntry>,
  byIdentity: Map<string, FileCacheEntry>
): void {
  const serialized = {
    byPath: Object.fromEntries(byPath.entries()),
    byIdentity: Object.fromEntries(byIdentity.entries()),
  };
  void context.workspaceState.update('fileCache', serialized);
}
