import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_LANGUAGE_CONFIGS } from './fileTrackerDefaults';
import { FileTrackerIgnoreService } from './fileTrackerIgnore';
import { globToRegExp, normalizeFilePath, normalizeFolderPath } from './fileTrackerPathUtils';
import { FileCacheEntry, LanguageConfig, ScanSettings, TrackedFile } from './fileTrackerTypes';

export class FileTrackerScanService {
  constructor(
    private readonly ignoreService: FileTrackerIgnoreService,
    private readonly getConfigs: () => LanguageConfig[],
    private readonly getScanSettings: () => ScanSettings,
    private readonly getThreshold: (languageIdOrDoc: string | vscode.TextDocument, fileName?: string) => number,
    private readonly cacheByPath: Map<string, FileCacheEntry>,
    private readonly cacheByIdentity: Map<string, FileCacheEntry>,
    private readonly saveFileCache: () => void
  ) {}

  async getOverThresholdFiles(
    lastScanAt: number,
    lastScanResults: TrackedFile[],
    force = false
  ): Promise<{ results: TrackedFile[]; lastScanAt: number; lastScanResults: TrackedFile[] }> {
    const refreshInterval = vscode.workspace.getConfiguration('refactorRadar').get<number>('refreshIntervalMs', 5000);
    const now = Date.now();
    if (!force && lastScanAt > 0 && now - lastScanAt < refreshInterval) {
      return { results: lastScanResults, lastScanAt, lastScanResults };
    }

    const results: TrackedFile[] = [];
    const skippedSchemes = new Set(['git', 'output', 'debug', 'search-editor']);
    const skippedLangs = new Set(['markdown', 'plaintext', 'json', 'jsonc', 'log']);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { results, lastScanAt, lastScanResults };
    }

    const root = workspaceFolders[0];
    const scanSettings = this.getScanSettings();
    const includes = this.getScanGlobPatterns();
    const exclude = this.getScanExcludeGlob();
    const gitIgnorePatterns = scanSettings.ignoreGitIgnore
      ? await this.getGitIgnoreMatchers(root)
      : [];

    const allFiles: vscode.Uri[] = [];
    for (const include of includes) {
      const pattern = new vscode.RelativePattern(root, include);
      const uris = await vscode.workspace.findFiles(pattern, exclude);
      allFiles.push(...uris);
    }

    const seenUriStrings = new Set<string>();
    const uniqueFiles = allFiles.filter(uri => {
      const key = uri.toString();
      if (seenUriStrings.has(key)) {
        return false;
      }
      seenUriStrings.add(key);
      return true;
    });

    const maxFiles = scanSettings.maxFilesToScan ?? Number.POSITIVE_INFINITY;
    let scannedCount = 0;
    const ignoredFolderSet = new Set(scanSettings.ignoredFolders.map(folder => normalizeFolderPath(folder)));
    const seenPaths = new Set<string>();

    for (const uri of uniqueFiles) {
      if (scannedCount >= maxFiles || skippedSchemes.has(uri.scheme)) {
        continue;
      }

      const relativePath = normalizeFolderPath(path.relative(root.uri.fsPath, uri.fsPath));
      if (!relativePath) {
        continue;
      }
      if (Array.from(ignoredFolderSet).some(folder => relativePath === folder || relativePath.startsWith(`${folder}/`))) {
        continue;
      }
      if (gitIgnorePatterns.length > 0 && this.isIgnoredByPatterns(relativePath, gitIgnorePatterns)) {
        continue;
      }

      scannedCount += 1;
      let lineCount: number;
      let languageId: string;
      let fileIdentity: string | undefined;
      const fileName = uri.fsPath;
      const normalizedPath = normalizeFilePath(fileName);
      seenPaths.add(normalizedPath);

      try {
        const stats = await this.ignoreService.getFileStats(fileName);
        if (!stats) {
          continue;
        }

        const { mtime, fileIdentity: statIdentity } = stats;
        fileIdentity = statIdentity;
        const cachedByIdentity = fileIdentity ? this.cacheByIdentity.get(fileIdentity) : undefined;
        const cachedByPath = this.cacheByPath.get(normalizedPath);

        if (cachedByIdentity && cachedByIdentity.mtime === mtime) {
          lineCount = cachedByIdentity.lineCount;
          languageId = cachedByIdentity.languageId;
          if (cachedByIdentity.filePath !== fileName) {
            const oldPath = normalizeFilePath(cachedByIdentity.filePath);
            this.cacheByPath.delete(oldPath);
            cachedByIdentity.filePath = fileName;
            this.cacheByPath.set(normalizedPath, cachedByIdentity);
          }
        } else if (cachedByPath && cachedByPath.mtime === mtime) {
          lineCount = cachedByPath.lineCount;
          languageId = cachedByPath.languageId;
          if (fileIdentity && cachedByPath.fileIdentity !== fileIdentity) {
            cachedByPath.fileIdentity = fileIdentity;
            this.cacheByIdentity.set(fileIdentity, cachedByPath);
          }
        } else {
          const doc = await vscode.workspace.openTextDocument(uri);
          lineCount = doc.lineCount;
          languageId = doc.languageId;
          const entry: FileCacheEntry = {
            mtime,
            lineCount,
            languageId,
            filePath: fileName,
            fileIdentity,
          };
          this.cacheByPath.set(normalizedPath, entry);
          if (fileIdentity) {
            this.cacheByIdentity.set(fileIdentity, entry);
          }
        }
      } catch {
        continue;
      }

      if (skippedLangs.has(languageId)) {
        continue;
      }

      const ignoreEntry = await this.ignoreService.resolveIgnoreEntry(fileName, fileIdentity);
      const threshold = this.getThreshold(languageId, fileName);
      const effectiveThreshold = this.ignoreService.getEffectiveThreshold(ignoreEntry, threshold);
      if (lineCount <= effectiveThreshold || this.ignoreService.isIgnoredEntry(ignoreEntry, lineCount)) {
        continue;
      }

      let isCustomLimit = false;
      const configs = this.getConfigs();
      const byLanguage = configs.find(c => c.languageId === languageId);
      if (byLanguage) {
        if (byLanguage.isCustom) {
          isCustomLimit = true;
        } else {
          const defaultCfg = DEFAULT_LANGUAGE_CONFIGS.find(c => c.languageId === languageId);
          if (defaultCfg && byLanguage.lines !== defaultCfg.lines) {
            isCustomLimit = true;
          }
        }
      } else {
        const ext = path.extname(fileName).toLowerCase();
        const byExtension = configs.find(c => c.extension === ext);
        if (byExtension) {
          if (byExtension.isCustom) {
            isCustomLimit = true;
          } else {
            const defaultCfg = DEFAULT_LANGUAGE_CONFIGS.find(c => c.extension === ext);
            if (defaultCfg && byExtension.lines !== defaultCfg.lines) {
              isCustomLimit = true;
            }
          }
        }
      }

      results.push({
        filePath: fileName,
        fileName: path.basename(fileName),
        languageId,
        lineCount,
        threshold: effectiveThreshold,
        overage: lineCount - effectiveThreshold,
        isCustomLimit,
      });
    }

    if (scannedCount < maxFiles) {
      this.pruneStaleCacheEntries(seenPaths);
    }

    this.saveFileCache();
    results.sort((left, right) => right.overage - left.overage);

    return {
      results,
      lastScanAt: Date.now(),
      lastScanResults: results,
    };
  }

  private async getGitIgnoreMatchers(root: vscode.WorkspaceFolder): Promise<Array<{ negated: boolean; regex: RegExp }>> {
    const filePath = path.join(root.uri.fsPath, '.gitignore');
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const lines = Buffer.from(content).toString('utf8').split(/\r?\n/);
      const patterns: Array<{ negated: boolean; regex: RegExp }> = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
          continue;
        }
        const negated = line.startsWith('!');
        const working = negated ? line.slice(1) : line;
        if (!working) {
          continue;
        }

        if (working.endsWith('/')) {
          const base = normalizeFolderPath(working);
          const regex = globToRegExp(`**/${base}/**`);
          patterns.push({ negated, regex });
          continue;
        }

        const normalized = normalizeFolderPath(working);
        const scopedPattern = normalized.includes('/') ? normalized : `**/${normalized}`;
        patterns.push({ negated, regex: globToRegExp(scopedPattern) });
      }

      return patterns;
    } catch {
      return [];
    }
  }

  private isIgnoredByPatterns(relativePath: string, patterns: Array<{ negated: boolean; regex: RegExp }>): boolean {
    let ignored = false;
    for (const pattern of patterns) {
      if (pattern.regex.test(relativePath)) {
        ignored = !pattern.negated;
      }
    }
    return ignored;
  }

  private pruneStaleCacheEntries(seenPaths: Set<string>): void {
    for (const [cachedPath] of this.cacheByPath.entries()) {
      if (!seenPaths.has(cachedPath)) {
        this.cacheByPath.delete(cachedPath);
      }
    }
    for (const [identity, entry] of this.cacheByIdentity.entries()) {
      const entryPath = normalizeFilePath(entry.filePath);
      if (!seenPaths.has(entryPath)) {
        this.cacheByIdentity.delete(identity);
      }
    }
  }

  private getScanGlobPatterns(): string[] {
    const exts = new Set<string>();
    for (const config of this.getConfigs()) {
      const ext = (config.extension || '').trim().toLowerCase();
      if (ext && ext.startsWith('.') && ext !== '.') {
        exts.add(ext);
      }
    }

    if (exts.size === 0) {
      for (const config of DEFAULT_LANGUAGE_CONFIGS) {
        exts.add(config.extension.toLowerCase());
      }
    }

    return Array.from(exts).map(ext => `**/*${ext}`);
  }

  private getScanExcludeGlob(): string {
    return '**/{node_modules,out,dist,build,coverage,.git,.vscode-test}/**';
  }
}
