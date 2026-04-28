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
exports.FileTrackerScanService = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const fileTrackerDefaults_1 = require("./fileTrackerDefaults");
const fileTrackerPathUtils_1 = require("./fileTrackerPathUtils");
class FileTrackerScanService {
    constructor(ignoreService, getConfigs, getScanSettings, getThreshold, cacheByPath, cacheByIdentity, saveFileCache) {
        this.ignoreService = ignoreService;
        this.getConfigs = getConfigs;
        this.getScanSettings = getScanSettings;
        this.getThreshold = getThreshold;
        this.cacheByPath = cacheByPath;
        this.cacheByIdentity = cacheByIdentity;
        this.saveFileCache = saveFileCache;
    }
    async getOverThresholdFiles(lastScanAt, lastScanResults, force = false) {
        const refreshInterval = vscode.workspace.getConfiguration('refactorRadar').get('refreshIntervalMs', 5000);
        const now = Date.now();
        if (!force && lastScanAt > 0 && now - lastScanAt < refreshInterval) {
            return { results: lastScanResults, lastScanAt, lastScanResults };
        }
        const results = [];
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
        const allFiles = [];
        for (const include of includes) {
            const pattern = new vscode.RelativePattern(root, include);
            const uris = await vscode.workspace.findFiles(pattern, exclude);
            allFiles.push(...uris);
        }
        const seenUriStrings = new Set();
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
        const ignoredFolderSet = new Set(scanSettings.ignoredFolders.map(folder => (0, fileTrackerPathUtils_1.normalizeFolderPath)(folder)));
        const seenPaths = new Set();
        for (const uri of uniqueFiles) {
            if (scannedCount >= maxFiles || skippedSchemes.has(uri.scheme)) {
                continue;
            }
            const relativePath = (0, fileTrackerPathUtils_1.normalizeFolderPath)(path.relative(root.uri.fsPath, uri.fsPath));
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
            let lineCount;
            let languageId;
            let fileIdentity;
            const fileName = uri.fsPath;
            const normalizedPath = (0, fileTrackerPathUtils_1.normalizeFilePath)(fileName);
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
                        const oldPath = (0, fileTrackerPathUtils_1.normalizeFilePath)(cachedByIdentity.filePath);
                        this.cacheByPath.delete(oldPath);
                        cachedByIdentity.filePath = fileName;
                        this.cacheByPath.set(normalizedPath, cachedByIdentity);
                    }
                }
                else if (cachedByPath && cachedByPath.mtime === mtime) {
                    lineCount = cachedByPath.lineCount;
                    languageId = cachedByPath.languageId;
                    if (fileIdentity && cachedByPath.fileIdentity !== fileIdentity) {
                        cachedByPath.fileIdentity = fileIdentity;
                        this.cacheByIdentity.set(fileIdentity, cachedByPath);
                    }
                }
                else {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    lineCount = doc.lineCount;
                    languageId = doc.languageId;
                    const entry = {
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
            }
            catch {
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
            results.push({
                filePath: fileName,
                fileName: path.basename(fileName),
                languageId,
                lineCount,
                threshold: effectiveThreshold,
                overage: lineCount - effectiveThreshold,
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
    async getGitIgnoreMatchers(root) {
        const filePath = path.join(root.uri.fsPath, '.gitignore');
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const lines = Buffer.from(content).toString('utf8').split(/\r?\n/);
            const patterns = [];
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
                    const base = (0, fileTrackerPathUtils_1.normalizeFolderPath)(working);
                    const regex = (0, fileTrackerPathUtils_1.globToRegExp)(`**/${base}/**`);
                    patterns.push({ negated, regex });
                    continue;
                }
                const normalized = (0, fileTrackerPathUtils_1.normalizeFolderPath)(working);
                const scopedPattern = normalized.includes('/') ? normalized : `**/${normalized}`;
                patterns.push({ negated, regex: (0, fileTrackerPathUtils_1.globToRegExp)(scopedPattern) });
            }
            return patterns;
        }
        catch {
            return [];
        }
    }
    isIgnoredByPatterns(relativePath, patterns) {
        let ignored = false;
        for (const pattern of patterns) {
            if (pattern.regex.test(relativePath)) {
                ignored = !pattern.negated;
            }
        }
        return ignored;
    }
    pruneStaleCacheEntries(seenPaths) {
        for (const [cachedPath] of this.cacheByPath.entries()) {
            if (!seenPaths.has(cachedPath)) {
                this.cacheByPath.delete(cachedPath);
            }
        }
        for (const [identity, entry] of this.cacheByIdentity.entries()) {
            const entryPath = (0, fileTrackerPathUtils_1.normalizeFilePath)(entry.filePath);
            if (!seenPaths.has(entryPath)) {
                this.cacheByIdentity.delete(identity);
            }
        }
    }
    getScanGlobPatterns() {
        const exts = new Set();
        for (const config of this.getConfigs()) {
            const ext = (config.extension || '').trim().toLowerCase();
            if (ext && ext.startsWith('.') && ext !== '.') {
                exts.add(ext);
            }
        }
        if (exts.size === 0) {
            for (const config of fileTrackerDefaults_1.DEFAULT_LANGUAGE_CONFIGS) {
                exts.add(config.extension.toLowerCase());
            }
        }
        return Array.from(exts).map(ext => `**/*${ext}`);
    }
    getScanExcludeGlob() {
        return '**/{node_modules,out,dist,build,coverage,.git,.vscode-test}/**';
    }
}
exports.FileTrackerScanService = FileTrackerScanService;
