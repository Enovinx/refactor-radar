import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_LANGUAGE_CONFIGS } from './fileTrackerDefaults';
import { FileTrackerIgnoreService } from './fileTrackerIgnore';
import { globToRegExp, normalizeFilePath, normalizeFolderPath } from './fileTrackerPathUtils';
import { FileCacheEntry, LanguageConfig, ScanSettings, TrackedFile } from './fileTrackerTypes';

export class FileTrackerScanService {
  private static readonly PROGRESS_LOG_INTERVAL = 500;

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
    const scanStartedAt = Date.now();
    console.log('[Refactor Radar] scan start');
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
    const trackedExtensions = this.getTrackedExtensions();
    const exclude = this.getScanExcludeGlob();
    const gitIgnoreStartedAt = Date.now();
    console.log('[Refactor Radar] phase start: load .gitignore');
    const gitIgnorePatterns = scanSettings.ignoreGitIgnore
      ? await this.getIgnoreMatchers(root, '.gitignore')
      : [];
    const rrIgnoreStartedAt = Date.now();
    console.log('[Refactor Radar] phase start: load .rrignore');
    const rrIgnorePatterns = await this.getIgnoreMatchers(root, '.rrignore');
    const discoveryStartedAt = Date.now();
    console.log('[Refactor Radar] phase start: discover workspace files');

    const uniqueFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root, '**/*'),
      exclude
    );
    const discoveryDuration = Date.now() - discoveryStartedAt;
    console.log(
      `[Refactor Radar] phase done: discover workspace files duration=${discoveryDuration}ms found=${uniqueFiles.length}`
    );

    const maxFiles = scanSettings.maxFilesToScan ?? Number.POSITIVE_INFINITY;
    const maxDepth = scanSettings.maxScanDepth ?? Number.POSITIVE_INFINITY;
    let scannedCount = 0;
    const ignoredFolderSet = new Set(scanSettings.ignoredFolders.map(folder => normalizeFolderPath(folder)));
    const ignoredFolders = Array.from(ignoredFolderSet);
    const seenPaths = new Set<string>();
    let extensionFilterCount = 0;
    let depthFilterCount = 0;
    let ignoredFolderFilterCount = 0;
    let gitIgnoreFilterCount = 0;
    let rrIgnoreFilterCount = 0;
    let statMissCount = 0;
    let skippedLanguageCount = 0;
    let ignoredThresholdCount = 0;
    let documentsOpenedCount = 0;
    let cacheHitByIdentityCount = 0;
    let cacheHitByPathCount = 0;
    let fileProcessingMs = 0;
    let statsMs = 0;
    let documentOpenMs = 0;
    let ignoreResolutionMs = 0;
    let thresholdMs = 0;

    for (const uri of uniqueFiles) {
      if (scannedCount >= maxFiles || skippedSchemes.has(uri.scheme)) {
        continue;
      }

      const fileStartedAt = Date.now();

      const relativePath = normalizeFolderPath(path.relative(root.uri.fsPath, uri.fsPath));
      if (!relativePath) {
        continue;
      }
      if (!trackedExtensions.has(path.extname(relativePath).toLowerCase())) {
        extensionFilterCount += 1;
        continue;
      }
      if (this.getRelativeDepth(relativePath) > maxDepth) {
        depthFilterCount += 1;
        continue;
      }
      if (ignoredFolders.some(folder => relativePath === folder || relativePath.startsWith(`${folder}/`))) {
        ignoredFolderFilterCount += 1;
        continue;
      }
      if (gitIgnorePatterns.length > 0 && this.isIgnoredByPatterns(relativePath, gitIgnorePatterns)) {
        gitIgnoreFilterCount += 1;
        continue;
      }
      if (rrIgnorePatterns.length > 0 && this.isIgnoredByPatterns(relativePath, rrIgnorePatterns)) {
        rrIgnoreFilterCount += 1;
        continue;
      }

      scannedCount += 1;
      if (scannedCount % FileTrackerScanService.PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = Date.now() - scanStartedAt;
        console.log(
          `[Refactor Radar] progress scanned=${scannedCount}/${uniqueFiles.length} alerts=${results.length} elapsed=${elapsed}ms`
        );
      }
      let lineCount: number;
      let languageId: string;
      let fileIdentity: string | undefined;
      const fileName = uri.fsPath;
      const normalizedPath = normalizeFilePath(fileName);
      seenPaths.add(normalizedPath);

      try {
        const statsStartedAt = Date.now();
        const stats = await this.ignoreService.getFileStats(fileName);
        statsMs += Date.now() - statsStartedAt;
        if (!stats) {
          statMissCount += 1;
          continue;
        }

        const { mtime, fileIdentity: statIdentity } = stats;
        fileIdentity = statIdentity;
        const cachedByIdentity = fileIdentity ? this.cacheByIdentity.get(fileIdentity) : undefined;
        const cachedByPath = this.cacheByPath.get(normalizedPath);

        if (cachedByIdentity && cachedByIdentity.mtime === mtime) {
          cacheHitByIdentityCount += 1;
          lineCount = cachedByIdentity.lineCount;
          languageId = cachedByIdentity.languageId;
          if (cachedByIdentity.filePath !== fileName) {
            const oldPath = normalizeFilePath(cachedByIdentity.filePath);
            this.cacheByPath.delete(oldPath);
            cachedByIdentity.filePath = fileName;
            this.cacheByPath.set(normalizedPath, cachedByIdentity);
          }
        } else if (cachedByPath && cachedByPath.mtime === mtime) {
          cacheHitByPathCount += 1;
          lineCount = cachedByPath.lineCount;
          languageId = cachedByPath.languageId;
          if (fileIdentity && cachedByPath.fileIdentity !== fileIdentity) {
            cachedByPath.fileIdentity = fileIdentity;
            this.cacheByIdentity.set(fileIdentity, cachedByPath);
          }
        } else {
          const documentStartedAt = Date.now();
          const doc = await vscode.workspace.openTextDocument(uri);
          documentOpenMs += Date.now() - documentStartedAt;
          documentsOpenedCount += 1;
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
        skippedLanguageCount += 1;
        continue;
      }

      const ignoreResolutionStartedAt = Date.now();
      const ignoreEntry = await this.ignoreService.resolveIgnoreEntry(fileName, fileIdentity);
      ignoreResolutionMs += Date.now() - ignoreResolutionStartedAt;
      const thresholdStartedAt = Date.now();
      const threshold = this.getThreshold(languageId, fileName);
      const effectiveThreshold = this.ignoreService.getEffectiveThreshold(ignoreEntry, threshold);
      thresholdMs += Date.now() - thresholdStartedAt;
      if (lineCount <= effectiveThreshold || this.ignoreService.isIgnoredEntry(ignoreEntry, lineCount)) {
        ignoredThresholdCount += 1;
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
      fileProcessingMs += Date.now() - fileStartedAt;
    }

    const pruneStartedAt = Date.now();
    if (scannedCount < maxFiles) {
      this.pruneStaleCacheEntries(seenPaths);
    }
    const pruneMs = Date.now() - pruneStartedAt;

    const saveCacheStartedAt = Date.now();
    this.saveFileCache();
    const saveCacheMs = Date.now() - saveCacheStartedAt;
    const sortStartedAt = Date.now();
    results.sort((left, right) => right.overage - left.overage);
    const sortMs = Date.now() - sortStartedAt;
    const totalMs = Date.now() - scanStartedAt;

    console.log(
      `[Refactor Radar] scan timings total=${totalMs}ms ` +
      `gitignore=${rrIgnoreStartedAt - gitIgnoreStartedAt}ms ` +
      `rrignore=${discoveryStartedAt - rrIgnoreStartedAt}ms ` +
      `discovery=${discoveryDuration}ms ` +
      `fileProcessing=${fileProcessingMs}ms ` +
      `stats=${statsMs}ms ` +
      `openDoc=${documentOpenMs}ms ` +
      `ignoreResolution=${ignoreResolutionMs}ms ` +
      `threshold=${thresholdMs}ms ` +
      `prune=${pruneMs}ms ` +
      `saveCache=${saveCacheMs}ms ` +
      `sort=${sortMs}ms ` +
      `found=${uniqueFiles.length} ` +
      `scanned=${scannedCount} ` +
      `alerts=${results.length} ` +
      `extFiltered=${extensionFilterCount} ` +
      `depthFiltered=${depthFilterCount} ` +
      `folderFiltered=${ignoredFolderFilterCount} ` +
      `gitignored=${gitIgnoreFilterCount} ` +
      `rrignored=${rrIgnoreFilterCount} ` +
      `langSkipped=${skippedLanguageCount} ` +
      `thresholdSkipped=${ignoredThresholdCount} ` +
      `statMisses=${statMissCount} ` +
      `openedDocs=${documentsOpenedCount} ` +
      `cacheIdentityHits=${cacheHitByIdentityCount} ` +
      `cachePathHits=${cacheHitByPathCount}`
    );

    return {
      results,
      lastScanAt: Date.now(),
      lastScanResults: results,
    };
  }

  private async getIgnoreMatchers(
    root: vscode.WorkspaceFolder,
    fileName: '.gitignore' | '.rrignore'
  ): Promise<Array<{ negated: boolean; regex: RegExp; directorySegment?: string }>> {
    const filePath = path.join(root.uri.fsPath, fileName);
    try {
      const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      return this.parseIgnoreFile(root, path.dirname(filePath), content);
    } catch {
      return [];
    }
  }

  private parseIgnoreFile(
    root: vscode.WorkspaceFolder,
    fileDir: string,
    content: Uint8Array
  ): Array<{ negated: boolean; regex: RegExp; directorySegment?: string }> {
    const lines = Buffer.from(content).toString('utf8').split(/\r?\n/);
    const patterns: Array<{ negated: boolean; regex: RegExp; directorySegment?: string }> = [];
    const relativeDir = normalizeFolderPath(path.relative(root.uri.fsPath, fileDir));
    const baseDir = relativeDir ? `${relativeDir}/` : '';

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
        const scopedPatterns = baseDir
          ? [`${baseDir}${base}/**`, `${baseDir}**/${base}/**`]
          : [`${base}/**`, `**/${base}/**`];
        const directorySegment =
          !baseDir && base && !base.includes('/') && !base.includes('*') && !base.includes('?')
            ? base
            : undefined;
        for (const scoped of scopedPatterns) {
          patterns.push({ negated, regex: globToRegExp(scoped), directorySegment });
        }
        continue;
      }

      const normalized = normalizeFolderPath(working);
      if (baseDir) {
        const scopedPatterns = normalized.includes('/')
          ? [`${baseDir}${normalized}`]
          : [
              `${baseDir}${normalized}`,
              `${baseDir}${normalized}/**`,
              `${baseDir}**/${normalized}`,
              `${baseDir}**/${normalized}/**`,
            ];
        for (const scopedPattern of scopedPatterns) {
          patterns.push({ negated, regex: globToRegExp(scopedPattern) });
        }
        continue;
      }

      const scopedPatterns = normalized.includes('/')
        ? [normalized]
        : [
            normalized,
            `${normalized}/**`,
            `**/${normalized}`,
            `**/${normalized}/**`,
          ];
      for (const scopedPattern of scopedPatterns) {
        patterns.push({ negated, regex: globToRegExp(scopedPattern) });
      }
    }

    return patterns;
  }

  private isIgnoredByPatterns(
    relativePath: string,
    patterns: Array<{ negated: boolean; regex: RegExp; directorySegment?: string }>
  ): boolean {
    let ignored = false;
    const pathSegments = relativePath.split('/').filter(Boolean);
    for (const pattern of patterns) {
      const matchesDirectorySegment = pattern.directorySegment
        ? pathSegments.includes(pattern.directorySegment)
        : false;
      if (matchesDirectorySegment || pattern.regex.test(relativePath)) {
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
      if (!seenPaths.has(entryPath) || entry.fileIdentity !== identity) {
        this.cacheByIdentity.delete(identity);
      }
    }
  }

  private getTrackedExtensions(): Set<string> {
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

    return exts;
  }

  private getScanExcludeGlob(): string | undefined {
    return undefined;
  }

  private getRelativeDepth(relativePath: string): number {
    if (!relativePath) {
      return 0;
    }
    return relativePath.split('/').filter(Boolean).length;
  }
}
