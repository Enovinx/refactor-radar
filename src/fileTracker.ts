import * as path from 'path';
import * as vscode from 'vscode';
import { FileTrackerIgnoreService } from './fileTracking/fileTrackerIgnore';
import { normalizeFilePath, normalizeFolderPath } from './fileTracking/fileTrackerPathUtils';
import { FileTrackerScanService } from './fileTracking/fileTrackerScan';
import {
  loadBatchPromptTemplate,
  loadConfigs,
  loadFileCache,
  loadIgnoredFiles,
  loadPromptTemplate,
  loadScanSettings,
  saveBatchPromptTemplate,
  saveConfigs,
  saveFileCache,
  saveIgnoredFiles,
  savePromptTemplate,
  saveScanSettings,
} from './fileTracking/fileTrackerStorage';
import {
  FileCacheEntry,
  IgnoreEntry,
  IgnoredFile,
  LanguageConfig,
  ScanSettings,
  TrackedFile,
} from './fileTracking/fileTrackerTypes';

export { LanguageConfig, TrackedFile, IgnoreEntry, IgnoredFile, ScanSettings } from './fileTracking/fileTrackerTypes';
export { DEFAULT_LANGUAGE_CONFIGS } from './fileTracking/fileTrackerDefaults';

export class FileTracker {
  private configs: LanguageConfig[];
  private ignoreMap: Map<string, IgnoreEntry>;
  private promptTemplate: string;
  private batchPromptTemplate: string;
  private scanSettings: ScanSettings = {
    ignoreGitIgnore: true,
    maxFilesToScan: null,
    ignoredFolders: [],
    hideFolders: false,
    hideFoldersWhileSearching: true,
    expandFoldersOnToggle: true,
  };
  private fileCacheByPath: Map<string, FileCacheEntry>;
  private fileCacheByIdentity: Map<string, FileCacheEntry>;
  private lastScanAt = 0;
  private lastScanResults: TrackedFile[] = [];
  private readonly ignoreService: FileTrackerIgnoreService;
  private readonly scanService: FileTrackerScanService;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onChange: () => void
  ) {
    this.configs = loadConfigs(context);
    this.ignoreMap = loadIgnoredFiles(context);
    const cache = loadFileCache(context);
    this.fileCacheByPath = cache.byPath;
    this.fileCacheByIdentity = cache.byIdentity;
    this.promptTemplate = loadPromptTemplate(context);
    this.batchPromptTemplate = loadBatchPromptTemplate(context);
    this.scanSettings = {
      ...this.scanSettings,
      ...loadScanSettings(context)
    };

    this.ignoreService = new FileTrackerIgnoreService(
      this.ignoreMap,
      () => saveIgnoredFiles(this.context, this.ignoreMap),
      this.onChange
    );

    this.scanService = new FileTrackerScanService(
      this.ignoreService,
      () => this.configs,
      () => this.scanSettings,
      (languageIdOrDoc, fileName) => this.getThreshold(languageIdOrDoc, fileName),
      this.fileCacheByPath,
      this.fileCacheByIdentity,
      () => saveFileCache(this.context, this.fileCacheByPath, this.fileCacheByIdentity)
    );
  }

  getConfigs(): LanguageConfig[] {
    return this.configs;
  }

  saveConfigs(): void {
    saveConfigs(this.context, this.configs);
  }

  getPromptTemplate(): string {
    return this.promptTemplate;
  }

  getBatchPromptTemplate(): string {
    return this.batchPromptTemplate;
  }

  getScanSettings(): ScanSettings {
    return this.scanSettings;
  }

  getWorkspaceRoot(): string | null {
    const root = vscode.workspace.workspaceFolders?.[0];
    return root ? root.uri.fsPath : null;
  }

  setPromptTemplate(template: string): void {
    this.promptTemplate = template;
    savePromptTemplate(this.context, this.promptTemplate);
    this.onChange();
  }

  resetPromptTemplate(): void {
    this.promptTemplate = '';
    savePromptTemplate(this.context, this.promptTemplate);
    this.onChange();
  }

  setBatchPromptTemplate(template: string): void {
    this.batchPromptTemplate = template;
    saveBatchPromptTemplate(this.context, this.batchPromptTemplate);
    this.onChange();
  }

  resetBatchPromptTemplate(): void {
    this.batchPromptTemplate = '';
    saveBatchPromptTemplate(this.context, this.batchPromptTemplate);
    this.onChange();
  }

  updateIgnoreGitIgnore(enabled: boolean): void {
    this.scanSettings.ignoreGitIgnore = enabled;
    saveScanSettings(this.context, this.scanSettings);
    this.onChange();
  }

  updateMaxFilesToScan(value: number | null): void {
    this.scanSettings.maxFilesToScan = value && value > 0 ? Math.floor(value) : null;
    saveScanSettings(this.context, this.scanSettings);
    this.onChange();
  }

  updateHideFolders(enabled: boolean): void {
    this.scanSettings.hideFolders = enabled;
    saveScanSettings(this.context, this.scanSettings);
    this.onChange();
  }

  updateHideFoldersWhileSearching(enabled: boolean): void {
    this.scanSettings.hideFoldersWhileSearching = enabled;
    saveScanSettings(this.context, this.scanSettings);
    this.onChange();
  }

  updateExpandFoldersOnToggle(enabled: boolean): void {
    this.scanSettings.expandFoldersOnToggle = enabled;
    saveScanSettings(this.context, this.scanSettings);
    this.onChange();
  }

  addIgnoredFolder(folder: string): void {
    const normalized = normalizeFolderPath(folder);
    if (!normalized) {
      return;
    }
    if (!this.scanSettings.ignoredFolders.includes(normalized)) {
      this.scanSettings.ignoredFolders.push(normalized);
      this.scanSettings.ignoredFolders.sort((a, b) => a.localeCompare(b));
      saveScanSettings(this.context, this.scanSettings);
      this.onChange();
    }
  }

  removeIgnoredFolder(folder: string): void {
    const normalized = normalizeFolderPath(folder);
    const next = this.scanSettings.ignoredFolders.filter(existing => existing !== normalized);
    if (next.length !== this.scanSettings.ignoredFolders.length) {
      this.scanSettings.ignoredFolders = next;
      saveScanSettings(this.context, this.scanSettings);
      this.onChange();
    }
  }

  updateThreshold(languageId: string, lines: number): void {
    const config = this.configs.find(item => item.languageId === languageId);
    if (config) {
      config.lines = lines;
      saveConfigs(this.context, this.configs);
      this.onChange();
    }
  }

  addCustomConfig(extension: string, lines: number): void {
    const ext = extension.startsWith('.') ? extension.slice(1) : extension;
    const extWithDot = `.${ext}`;
    const languageId = `custom:${extWithDot}`;
    const existing = this.configs.find(item => item.languageId === languageId);

    if (existing) {
      existing.lines = lines;
    } else {
      this.configs.push({
        languageId,
        displayName: ext.toUpperCase(),
        extension: extWithDot,
        lines,
        isCustom: true,
      });
    }

    saveConfigs(this.context, this.configs);
    this.onChange();
  }

  removeCustomConfig(languageId: string): void {
    this.configs = this.configs.filter(config => !(config.languageId === languageId && config.isCustom));
    saveConfigs(this.context, this.configs);
    this.onChange();
  }

  getThreshold(languageIdOrDoc: string | vscode.TextDocument, fileName?: string): number {
    const isDoc = typeof languageIdOrDoc !== 'string';
    const languageId = isDoc ? languageIdOrDoc.languageId : languageIdOrDoc;
    const name = isDoc ? languageIdOrDoc.fileName : (fileName || '');

    const byLanguage = this.configs.find(config => config.languageId === languageId);
    if (byLanguage) {
      return byLanguage.lines;
    }

    const ext = path.extname(name).toLowerCase();
    const byExtension = this.configs.find(config => config.extension === ext);
    if (byExtension) {
      return byExtension.lines;
    }

    const defaultConfig = vscode.workspace.getConfiguration('refactorRadar');
    return defaultConfig.get<number>('defaultThreshold', 300);
  }

  async ignoreForLines(filePath: string, currentLines: number, extraLines: number): Promise<void> {
    await this.ignoreService.ignoreForLines(filePath, currentLines, extraLines);
  }

  async ignoreForever(filePath: string): Promise<void> {
    await this.ignoreService.ignoreForever(filePath);
  }

  removeFileFromLastScan(filePath: string): void {
    const normalizedTarget = normalizeFilePath(filePath);
    this.lastScanResults = this.lastScanResults.filter(file => normalizeFilePath(file.filePath) !== normalizedTarget);
  }

  removeFolderFromLastScan(folder: string): void {
    const normalizedFolder = normalizeFolderPath(folder);
    if (!normalizedFolder) {
      return;
    }
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }
    const prefix = `${normalizedFolder}/`;
    this.lastScanResults = this.lastScanResults.filter(file => {
      const relativePath = normalizeFolderPath(path.relative(root, file.filePath));
      return relativePath !== normalizedFolder && !relativePath.startsWith(prefix);
    });
  }

  unignore(filePath: string): void {
    this.ignoreService.unignore(filePath);
  }

  removeLineBonus(filePath: string): void {
    this.ignoreService.removeLineBonus(filePath);
  }

  cancelPermanentIgnore(filePath: string): void {
    this.ignoreService.cancelPermanentIgnore(filePath);
  }

  getIgnoredFiles(): IgnoredFile[] {
    return this.ignoreService.getIgnoredFiles();
  }

  async getOverThresholdFiles(force = false): Promise<TrackedFile[]> {
    const scan = await this.scanService.getOverThresholdFiles(this.lastScanAt, this.lastScanResults, force);
    this.lastScanAt = scan.lastScanAt;
    this.lastScanResults = scan.lastScanResults;
    return scan.results;
  }

  async getDocumentByPath(filePath: string): Promise<vscode.TextDocument | undefined> {
    const normalizedTarget = normalizeFilePath(filePath);
    const openDocument = vscode.workspace.textDocuments.find(
      document => normalizeFilePath(document.fileName) === normalizedTarget
    );
    if (openDocument) {
      return openDocument;
    }

    try {
      return await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    } catch {
      return undefined;
    }
  }
}
