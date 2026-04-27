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
exports.FileTracker = exports.DEFAULT_LANGUAGE_CONFIGS = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// ─── Defaults ────────────────────────────────────────────────────────────────
exports.DEFAULT_LANGUAGE_CONFIGS = [
    { languageId: 'typescript', displayName: 'TypeScript', extension: '.ts', lines: 300 },
    { languageId: 'typescriptreact', displayName: 'TSX', extension: '.tsx', lines: 300 },
    { languageId: 'javascript', displayName: 'JavaScript', extension: '.js', lines: 300 },
    { languageId: 'javascriptreact', displayName: 'JSX', extension: '.jsx', lines: 300 },
    { languageId: 'python', displayName: 'Python', extension: '.py', lines: 500 },
    { languageId: 'java', displayName: 'Java', extension: '.java', lines: 400 },
    { languageId: 'c', displayName: 'C', extension: '.c', lines: 500 },
    { languageId: 'cpp', displayName: 'C++', extension: '.cpp', lines: 500 },
    { languageId: 'go', displayName: 'Go', extension: '.go', lines: 400 },
    { languageId: 'rust', displayName: 'Rust', extension: '.rs', lines: 400 },
    { languageId: 'php', displayName: 'PHP', extension: '.php', lines: 400 },
    { languageId: 'ruby', displayName: 'Ruby', extension: '.rb', lines: 300 },
    { languageId: 'css', displayName: 'CSS', extension: '.css', lines: 300 },
    { languageId: 'scss', displayName: 'SCSS', extension: '.scss', lines: 300 },
    { languageId: 'html', displayName: 'HTML', extension: '.html', lines: 250 },
    { languageId: 'vue', displayName: 'Vue', extension: '.vue', lines: 300 },
    { languageId: 'svelte', displayName: 'Svelte', extension: '.svelte', lines: 300 },
    { languageId: 'csharp', displayName: 'C#', extension: '.cs', lines: 400 },
    { languageId: 'kotlin', displayName: 'Kotlin', extension: '.kt', lines: 400 },
    { languageId: 'swift', displayName: 'Swift', extension: '.swift', lines: 400 },
    { languageId: 'shellscript', displayName: 'Shell', extension: '.sh', lines: 200 },
];
// ─── FileTracker ─────────────────────────────────────────────────────────────
class FileTracker {
    constructor(context, onChange) {
        this.context = context;
        this.configs = [];
        this.ignoreMap = new Map();
        this.promptTemplate = '';
        this.batchPromptTemplate = '';
        this.scanSettings = {
            ignoreGitIgnore: true,
            maxFilesToScan: null,
            ignoredFolders: [],
        };
        // ── File scanning ─────────────────────────────────────────────────────────
        this.fileCache = new Map();
        this.onChange = onChange;
        this.loadConfigs();
        this.loadIgnoredFiles();
        this.loadPromptTemplate();
        this.loadBatchPromptTemplate();
        this.loadScanSettings();
    }
    // ── Config persistence ────────────────────────────────────────────────────
    loadConfigs() {
        const saved = this.context.workspaceState.get('languageConfigs');
        if (saved && saved.length > 0) {
            this.configs = saved;
        }
        else {
            this.configs = exports.DEFAULT_LANGUAGE_CONFIGS.map(c => ({ ...c, isCustom: false }));
        }
    }
    loadPromptTemplate() {
        this.promptTemplate = this.context.workspaceState.get('promptTemplate', '');
    }
    loadBatchPromptTemplate() {
        this.batchPromptTemplate = this.context.workspaceState.get('batchPromptTemplate', '');
    }
    loadScanSettings() {
        const saved = this.context.workspaceState.get('scanSettings', {});
        this.scanSettings = {
            ignoreGitIgnore: saved.ignoreGitIgnore ?? true,
            maxFilesToScan: typeof saved.maxFilesToScan === 'number' && saved.maxFilesToScan > 0
                ? Math.floor(saved.maxFilesToScan)
                : null,
            ignoredFolders: Array.isArray(saved.ignoredFolders)
                ? saved.ignoredFolders.filter(Boolean).map(folder => this.normalizeFolderPath(folder))
                : [],
        };
    }
    saveScanSettings() {
        void this.context.workspaceState.update('scanSettings', this.scanSettings);
    }
    normalizeFilePath(filePath) {
        const normalized = path.normalize(filePath);
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }
    loadIgnoredFiles() {
        const saved = this.context.workspaceState.get('ignoredFiles', {});
        this.ignoreMap = new Map(Object.entries(saved));
    }
    saveIgnoredFiles() {
        const serialized = Object.fromEntries(this.ignoreMap.entries());
        this.context.workspaceState.update('ignoredFiles', serialized);
    }
    saveConfigs() {
        this.context.workspaceState.update('languageConfigs', this.configs);
    }
    savePromptTemplate() {
        this.context.workspaceState.update('promptTemplate', this.promptTemplate);
    }
    saveBatchPromptTemplate() {
        this.context.workspaceState.update('batchPromptTemplate', this.batchPromptTemplate);
    }
    getConfigs() {
        return this.configs;
    }
    getPromptTemplate() {
        return this.promptTemplate;
    }
    getBatchPromptTemplate() {
        return this.batchPromptTemplate;
    }
    getScanSettings() {
        return this.scanSettings;
    }
    setPromptTemplate(template) {
        this.promptTemplate = template;
        this.savePromptTemplate();
        this.onChange();
    }
    resetPromptTemplate() {
        this.promptTemplate = '';
        this.savePromptTemplate();
        this.onChange();
    }
    setBatchPromptTemplate(template) {
        this.batchPromptTemplate = template;
        this.saveBatchPromptTemplate();
        this.onChange();
    }
    resetBatchPromptTemplate() {
        this.batchPromptTemplate = '';
        this.saveBatchPromptTemplate();
        this.onChange();
    }
    updateIgnoreGitIgnore(enabled) {
        this.scanSettings.ignoreGitIgnore = enabled;
        this.saveScanSettings();
        this.onChange();
    }
    updateMaxFilesToScan(value) {
        this.scanSettings.maxFilesToScan = value && value > 0 ? Math.floor(value) : null;
        this.saveScanSettings();
        this.onChange();
    }
    addIgnoredFolder(folder) {
        const normalized = this.normalizeFolderPath(folder);
        if (!normalized) {
            return;
        }
        if (!this.scanSettings.ignoredFolders.includes(normalized)) {
            this.scanSettings.ignoredFolders.push(normalized);
            this.scanSettings.ignoredFolders.sort((a, b) => a.localeCompare(b));
            this.saveScanSettings();
            this.onChange();
        }
    }
    removeIgnoredFolder(folder) {
        const normalized = this.normalizeFolderPath(folder);
        const next = this.scanSettings.ignoredFolders.filter(existing => existing !== normalized);
        if (next.length !== this.scanSettings.ignoredFolders.length) {
            this.scanSettings.ignoredFolders = next;
            this.saveScanSettings();
            this.onChange();
        }
    }
    updateThreshold(languageId, lines) {
        const cfg = this.configs.find(c => c.languageId === languageId);
        if (cfg) {
            cfg.lines = lines;
            this.saveConfigs();
            this.onChange();
        }
    }
    addCustomConfig(extension, lines) {
        const ext = extension.startsWith('.') ? extension.slice(1) : extension;
        const extWithDot = '.' + ext;
        const langId = 'custom:' + extWithDot;
        const existing = this.configs.find(c => c.languageId === langId);
        if (existing) {
            existing.lines = lines;
        }
        else {
            this.configs.push({
                languageId: langId,
                displayName: ext.toUpperCase(),
                extension: extWithDot,
                lines,
                isCustom: true,
            });
        }
        this.saveConfigs();
        this.onChange();
    }
    removeCustomConfig(languageId) {
        this.configs = this.configs.filter(c => !(c.languageId === languageId && c.isCustom));
        this.saveConfigs();
        this.onChange();
    }
    // ── Threshold resolution ──────────────────────────────────────────────────
    getThreshold(languageIdOrDoc, fileName) {
        const isDoc = typeof languageIdOrDoc !== 'string';
        const langId = isDoc ? languageIdOrDoc.languageId : languageIdOrDoc;
        const name = isDoc ? languageIdOrDoc.fileName : (fileName || '');
        // 1. Match by languageId
        const byLang = this.configs.find(c => c.languageId === langId);
        if (byLang) {
            return byLang.lines;
        }
        // 2. Match by file extension (for custom types)
        const ext = path.extname(name).toLowerCase();
        const byExt = this.configs.find(c => c.extension === ext);
        if (byExt) {
            return byExt.lines;
        }
        // 3. Global default
        const defaultCfg = vscode.workspace.getConfiguration('refactorRadar');
        return defaultCfg.get('defaultThreshold', 300);
    }
    // ── Ignore state ──────────────────────────────────────────────────────────
    async ignoreForLines(filePath, currentLines, extraLines) {
        const fileIdentity = await this.getFileIdentityFromPath(filePath);
        this.ignoreMap.set(this.normalizeFilePath(filePath), {
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
        const fileIdentity = await this.getFileIdentityFromPath(filePath);
        this.ignoreMap.set(this.normalizeFilePath(filePath), {
            kind: 'forever',
            originalFilePath: filePath,
            fileIdentity,
        });
        this.saveIgnoredFiles();
        this.onChange();
    }
    unignore(filePath) {
        this.ignoreMap.delete(this.normalizeFilePath(filePath));
        this.saveIgnoredFiles();
        this.onChange();
    }
    removeLineBonus(filePath) {
        const normalized = this.normalizeFilePath(filePath);
        const entry = this.ignoreMap.get(normalized);
        if (entry?.kind !== 'lines') {
            return;
        }
        this.ignoreMap.delete(normalized);
        this.saveIgnoredFiles();
        this.onChange();
    }
    cancelPermanentIgnore(filePath) {
        const normalized = this.normalizeFilePath(filePath);
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
        // Temporary: ignored whenever the file is within the saved cap.
        // Keep the rule even if the file temporarily exceeds it, so dropping
        // back under the cap re-applies the ignore as users expect.
        if (entry.kind === 'lines' && entry.untilLines !== undefined) {
            if (currentLines <= entry.untilLines) {
                return true;
            }
        }
        return false;
    }
    getEffectiveThreshold(entry, baseThreshold) {
        if (entry?.kind === 'lines' && entry.untilLines !== undefined) {
            return Math.max(baseThreshold, entry.untilLines);
        }
        return baseThreshold;
    }
    async getFileIdentityFromPath(filePath) {
        try {
            const stats = await fs.promises.stat(filePath, { bigint: true });
            const scheme = process.platform === 'win32' ? 'win-fileid' : 'posix-inode';
            return `${scheme}:${stats.dev.toString()}:${stats.ino.toString()}`;
        }
        catch {
            return undefined;
        }
    }
    async resolveIgnoreEntry(fileName) {
        const normalizedPath = this.normalizeFilePath(fileName);
        const directEntry = this.ignoreMap.get(normalizedPath);
        const fileIdentity = await this.getFileIdentityFromPath(fileName);
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
    normalizeFolderPath(folder) {
        return folder
            .trim()
            .replace(/\\/g, '/')
            .replace(/^\/+/, '')
            .replace(/\/+$/, '');
    }
    globToRegExp(pattern) {
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '::DOUBLE_STAR::')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
            .replace(/::DOUBLE_STAR::/g, '.*');
        return new RegExp(`^${escaped}$`);
    }
    async getGitIgnoreMatchers(root) {
        const filePath = path.join(root.uri.fsPath, '.gitignore');
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split(/\r?\n/);
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
                    const base = this.normalizeFolderPath(working);
                    const regex = this.globToRegExp(`**/${base}/**`);
                    patterns.push({ negated, regex });
                    continue;
                }
                const normalized = this.normalizeFolderPath(working);
                const scopedPattern = normalized.includes('/') ? normalized : `**/${normalized}`;
                patterns.push({ negated, regex: this.globToRegExp(scopedPattern) });
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
    async getOverThresholdFiles() {
        console.log('Scanning workspace...');
        const results = [];
        const skippedSchemes = new Set(['git', 'output', 'debug', 'search-editor']);
        const skippedLangs = new Set(['markdown', 'plaintext', 'json', 'jsonc', 'log']);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return results;
        }
        // Limit scanning to relevant files; scanning the whole workspace can be very slow
        // (and can effectively hang the sidebar render).
        const includes = this.getScanGlobPatterns();
        const exclude = this.getScanExcludeGlob();
        const root = workspaceFolders[0];
        const gitIgnorePatterns = this.scanSettings.ignoreGitIgnore
            ? await this.getGitIgnoreMatchers(root)
            : [];
        // findFiles only accepts one include pattern, so scan per-extension.
        const allFiles = [];
        for (const inc of includes) {
            const pattern = new vscode.RelativePattern(root, inc);
            const uris = await vscode.workspace.findFiles(pattern, exclude);
            allFiles.push(...uris);
        }
        console.log('Scanning workspace...2');
        // De-dupe (multiple globs can match the same file)
        const seen = new Set();
        const uniqueFiles = allFiles.filter(u => {
            const key = u.toString();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
        console.log('Scanning workspace..x');
        const maxFiles = this.scanSettings.maxFilesToScan ?? Number.POSITIVE_INFINITY;
        let scannedCount = 0;
        const ignoredFolderSet = new Set(this.scanSettings.ignoredFolders.map(folder => this.normalizeFolderPath(folder)));
        for (const uri of uniqueFiles) {
            if (scannedCount >= maxFiles) {
                break;
            }
            if (skippedSchemes.has(uri.scheme)) {
                continue;
            }
            const relativePath = this.normalizeFolderPath(path.relative(root.uri.fsPath, uri.fsPath));
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
            const fileName = uri.fsPath;
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                const cacheKey = uri.toString();
                const cached = this.fileCache.get(cacheKey);
                if (cached && cached.mtime === stat.mtime) {
                    lineCount = cached.lineCount;
                    languageId = cached.languageId;
                }
                else {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    lineCount = doc.lineCount;
                    languageId = doc.languageId;
                    this.fileCache.set(cacheKey, { mtime: stat.mtime, lineCount, languageId });
                }
            }
            catch {
                // Unreadable/binary/permission errors should not block the whole scan.
                continue;
            }
            if (skippedLangs.has(languageId)) {
                continue;
            }
            const ignoreEntry = await this.resolveIgnoreEntry(fileName);
            const threshold = this.getThreshold(languageId, fileName);
            const effectiveThreshold = this.getEffectiveThreshold(ignoreEntry, threshold);
            if (lineCount <= effectiveThreshold) {
                continue;
            }
            if (this.isIgnoredEntry(ignoreEntry, lineCount)) {
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
        console.log('Scanning workspace...3');
        // Sort: worst offenders first
        results.sort((a, b) => b.overage - a.overage);
        return results;
    }
    getScanGlobPatterns() {
        // Build a list of extensions we care about based on configs.
        // This avoids scanning node_modules and other huge directories by default.
        const exts = new Set();
        for (const cfg of this.configs) {
            const ext = (cfg.extension || '').trim().toLowerCase();
            if (!ext) {
                continue;
            }
            if (!ext.startsWith('.')) {
                continue;
            }
            if (ext === '.') {
                continue;
            }
            exts.add(ext);
        }
        // If something goes wrong and we have no extensions, fall back to a sane subset.
        if (exts.size === 0) {
            for (const cfg of exports.DEFAULT_LANGUAGE_CONFIGS) {
                exts.add(cfg.extension.toLowerCase());
            }
        }
        // vscode globs: **/*.ts etc.
        return Array.from(exts).map(ext => `**/*${ext}`);
    }
    getScanExcludeGlob() {
        // Keep this conservative: exclude known large/noisy folders.
        return '**/{node_modules,out,dist,build,coverage,.git,.vscode-test}/**';
    }
    async getDocumentByPath(filePath) {
        const normalizedTarget = this.normalizeFilePath(filePath);
        const openDoc = vscode.workspace.textDocuments.find(d => this.normalizeFilePath(d.fileName) === normalizedTarget);
        if (openDoc) {
            return openDoc;
        }
        try {
            return await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        }
        catch {
            return undefined;
        }
    }
}
exports.FileTracker = FileTracker;
