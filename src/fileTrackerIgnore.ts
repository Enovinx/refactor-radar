import * as fs from 'fs';
import * as path from 'path';
import {
  IgnoreEntry,
  IgnoredFile,
} from './fileTrackerTypes';
import { normalizeFilePath } from './fileTrackerPathUtils';

export class FileTrackerIgnoreService {
  constructor(
    private readonly ignoreMap: Map<string, IgnoreEntry>,
    private readonly saveIgnoredFiles: () => void,
    private readonly onChange: () => void
  ) {}

  async ignoreForLines(filePath: string, currentLines: number, extraLines: number): Promise<void> {
    const fileIdentity = (await this.getFileStats(filePath))?.fileIdentity;
    this.ignoreMap.set(normalizeFilePath(filePath), {
      kind: 'lines',
      untilLines: currentLines + extraLines,
      bonusLines: extraLines,
      originalFilePath: filePath,
      fileIdentity,
    });
    this.saveIgnoredFiles();
    this.onChange();
  }

  async ignoreForever(filePath: string): Promise<void> {
    const fileIdentity = (await this.getFileStats(filePath))?.fileIdentity;
    this.ignoreMap.set(normalizeFilePath(filePath), {
      kind: 'forever',
      originalFilePath: filePath,
      fileIdentity,
    });
    this.saveIgnoredFiles();
    this.onChange();
  }

  unignore(filePath: string): void {
    this.ignoreMap.delete(normalizeFilePath(filePath));
    this.saveIgnoredFiles();
    this.onChange();
  }

  removeLineBonus(filePath: string): void {
    const normalized = normalizeFilePath(filePath);
    const entry = this.ignoreMap.get(normalized);
    if (entry?.kind !== 'lines') {
      return;
    }
    this.ignoreMap.delete(normalized);
    this.saveIgnoredFiles();
    this.onChange();
  }

  cancelPermanentIgnore(filePath: string): void {
    const normalized = normalizeFilePath(filePath);
    const entry = this.ignoreMap.get(normalized);
    if (entry?.kind !== 'forever') {
      return;
    }
    this.ignoreMap.delete(normalized);
    this.saveIgnoredFiles();
    this.onChange();
  }

  getIgnoredFiles(): IgnoredFile[] {
    const ignoredFiles = Array.from(this.ignoreMap.entries()).map(([filePath, entry]) => ({
      filePath: entry.originalFilePath || filePath,
      fileName: path.basename(entry.originalFilePath || filePath),
      kind: entry.kind,
      untilLines: entry.untilLines,
      bonusLines: entry.bonusLines,
    }));

    ignoredFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return ignoredFiles;
  }

  isIgnoredEntry(entry: IgnoreEntry | undefined, currentLines: number): boolean {
    if (!entry) {
      return false;
    }
    if (entry.kind === 'forever') {
      return true;
    }
    return entry.kind === 'lines' && entry.untilLines !== undefined && currentLines <= entry.untilLines;
  }

  getEffectiveThreshold(entry: IgnoreEntry | undefined, baseThreshold: number): number {
    if (entry?.kind === 'lines' && entry.untilLines !== undefined) {
      return Math.max(baseThreshold, entry.untilLines);
    }
    return baseThreshold;
  }

  async resolveIgnoreEntry(fileName: string, fileIdentity?: string): Promise<IgnoreEntry | undefined> {
    const normalizedPath = normalizeFilePath(fileName);
    const directEntry = this.ignoreMap.get(normalizedPath);

    if (directEntry) {
      let changed = false;
      if (fileIdentity && directEntry.fileIdentity !== fileIdentity) {
        directEntry.fileIdentity = fileIdentity;
        changed = true;
      }
      if (directEntry.originalFilePath !== fileName) {
        directEntry.originalFilePath = fileName;
        changed = true;
      }
      if (changed) {
        this.ignoreMap.set(normalizedPath, directEntry);
        this.saveIgnoredFiles();
      }
      return directEntry;
    }

    if (this.ignoreMap.size === 0 || !fileIdentity) {
      return undefined;
    }

    for (const [savedPath, entry] of this.ignoreMap.entries()) {
      if (!entry.fileIdentity || entry.fileIdentity !== fileIdentity) {
        continue;
      }

      this.ignoreMap.delete(savedPath);
      this.ignoreMap.set(normalizedPath, {
        ...entry,
        originalFilePath: fileName,
        fileIdentity,
      });
      this.saveIgnoredFiles();
      return this.ignoreMap.get(normalizedPath);
    }

    return undefined;
  }

  private getStatIdentity(stats: fs.Stats | fs.BigIntStats): string {
    const scheme = process.platform === 'win32' ? 'win-fileid' : 'posix-inode';
    const dev = (stats as fs.BigIntStats).dev;
    const ino = (stats as fs.BigIntStats).ino;
    const devString = typeof dev === 'bigint' ? dev.toString() : String(dev);
    const inoString = typeof ino === 'bigint' ? ino.toString() : String(ino);
    return `${scheme}:${devString}:${inoString}`;
  }

  async getFileStats(filePath: string): Promise<{ mtime: number; fileIdentity?: string } | undefined> {
    try {
      const stats = await fs.promises.stat(filePath, { bigint: true });
      const mtimeRaw = (stats as fs.BigIntStats).mtimeMs;
      const mtime = typeof mtimeRaw === 'bigint' ? Number(mtimeRaw) : mtimeRaw;
      const fileIdentity = this.getStatIdentity(stats);
      return { mtime, fileIdentity };
    } catch {
      return undefined;
    }
  }
}
