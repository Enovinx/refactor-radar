"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileTrackerIgnoreService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileTrackerPathUtils_1 = require("./fileTrackerPathUtils");
class FileTrackerIgnoreService {
    constructor(ignoreMap, saveIgnoredFiles, onChange) {
        this.ignoreMap = ignoreMap;
        this.saveIgnoredFiles = saveIgnoredFiles;
        this.onChange = onChange;
    }
    async ignoreForLines(filePath, currentLines, extraLines) {
        const fileIdentity = (await this.getFileStats(filePath))?.fileIdentity;
        this.ignoreMap.set((0, fileTrackerPathUtils_1.normalizeFilePath)(filePath), {
            kind: 'lines',
            untilLines: currentLines + extraLines,
            bonusLines: extraLines,
            originalFilePath: filePath,
            fileIdentity,
        });
        this.saveIgnoredFiles();
        this.onChange();
    }
    async ignoreForever(filePath) {
        const fileIdentity = (await this.getFileStats(filePath))?.fileIdentity;
        this.ignoreMap.set((0, fileTrackerPathUtils_1.normalizeFilePath)(filePath), {
            kind: 'forever',
            originalFilePath: filePath,
            fileIdentity,
        });
        this.saveIgnoredFiles();
        this.onChange();
    }
    unignore(filePath) {
        this.ignoreMap.delete((0, fileTrackerPathUtils_1.normalizeFilePath)(filePath));
        this.saveIgnoredFiles();
        this.onChange();
    }
    removeLineBonus(filePath) {
        const normalized = (0, fileTrackerPathUtils_1.normalizeFilePath)(filePath);
        const entry = this.ignoreMap.get(normalized);
        if (entry?.kind !== 'lines') {
            return;
        }
        this.ignoreMap.delete(normalized);
        this.saveIgnoredFiles();
        this.onChange();
    }
    cancelPermanentIgnore(filePath) {
        const normalized = (0, fileTrackerPathUtils_1.normalizeFilePath)(filePath);
        const entry = this.ignoreMap.get(normalized);
        if (entry?.kind !== 'forever') {
            return;
        }
        this.ignoreMap.delete(normalized);
        this.saveIgnoredFiles();
        this.onChange();
    }
    getIgnoredFiles() {
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
    isIgnoredEntry(entry, currentLines) {
        if (!entry) {
            return false;
        }
        if (entry.kind === 'forever') {
            return true;
        }
        return entry.kind === 'lines' && entry.untilLines !== undefined && currentLines <= entry.untilLines;
    }
    getEffectiveThreshold(entry, baseThreshold) {
        if (entry?.kind === 'lines' && entry.untilLines !== undefined) {
            return Math.max(baseThreshold, entry.untilLines);
        }
        return baseThreshold;
    }
    async resolveIgnoreEntry(fileName, fileIdentity) {
        const normalizedPath = (0, fileTrackerPathUtils_1.normalizeFilePath)(fileName);
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
    getStatIdentity(stats) {
        const scheme = process.platform === 'win32' ? 'win-fileid' : 'posix-inode';
        const dev = stats.dev;
        const ino = stats.ino;
        const devString = typeof dev === 'bigint' ? dev.toString() : String(dev);
        const inoString = typeof ino === 'bigint' ? ino.toString() : String(ino);
        return `${scheme}:${devString}:${inoString}`;
    }
    async getFileStats(filePath) {
        try {
            const stats = await fs.promises.stat(filePath, { bigint: true });
            const mtimeRaw = stats.mtimeMs;
            const mtime = typeof mtimeRaw === 'bigint' ? Number(mtimeRaw) : mtimeRaw;
            const fileIdentity = this.getStatIdentity(stats);
            return { mtime, fileIdentity };
        }
        catch {
            return undefined;
        }
    }
}
exports.FileTrackerIgnoreService = FileTrackerIgnoreService;
