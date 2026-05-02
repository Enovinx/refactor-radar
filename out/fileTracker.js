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
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const fileTrackerIgnore_1 = require("./fileTracking/fileTrackerIgnore");
const fileTrackerPathUtils_1 = require("./fileTracking/fileTrackerPathUtils");
const fileTrackerScan_1 = require("./fileTracking/fileTrackerScan");
const fileTrackerStorage_1 = require("./fileTracking/fileTrackerStorage");
var fileTrackerDefaults_1 = require("./fileTracking/fileTrackerDefaults");
Object.defineProperty(exports, "DEFAULT_LANGUAGE_CONFIGS", { enumerable: true, get: function () { return fileTrackerDefaults_1.DEFAULT_LANGUAGE_CONFIGS; } });
class FileTracker {
    constructor(context, onChange) {
        this.context = context;
        this.onChange = onChange;
        this.scanSettings = {
            ignoreGitIgnore: true,
            maxFilesToScan: null,
            ignoredFolders: [],
            hideFolders: false,
            hideFoldersWhileSearching: true,
        };
        this.lastScanAt = 0;
        this.lastScanResults = [];
        this.configs = (0, fileTrackerStorage_1.loadConfigs)(context);
        this.ignoreMap = (0, fileTrackerStorage_1.loadIgnoredFiles)(context);
        const cache = (0, fileTrackerStorage_1.loadFileCache)(context);
        this.fileCacheByPath = cache.byPath;
        this.fileCacheByIdentity = cache.byIdentity;
        this.promptTemplate = (0, fileTrackerStorage_1.loadPromptTemplate)(context);
        this.batchPromptTemplate = (0, fileTrackerStorage_1.loadBatchPromptTemplate)(context);
        this.scanSettings = {
            ...this.scanSettings,
            ...(0, fileTrackerStorage_1.loadScanSettings)(context)
        };
        this.ignoreService = new fileTrackerIgnore_1.FileTrackerIgnoreService(this.ignoreMap, () => (0, fileTrackerStorage_1.saveIgnoredFiles)(this.context, this.ignoreMap), this.onChange);
        this.scanService = new fileTrackerScan_1.FileTrackerScanService(this.ignoreService, () => this.configs, () => this.scanSettings, (languageIdOrDoc, fileName) => this.getThreshold(languageIdOrDoc, fileName), this.fileCacheByPath, this.fileCacheByIdentity, () => (0, fileTrackerStorage_1.saveFileCache)(this.context, this.fileCacheByPath, this.fileCacheByIdentity));
    }
    getConfigs() {
        return this.configs;
    }
    saveConfigs() {
        (0, fileTrackerStorage_1.saveConfigs)(this.context, this.configs);
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
    getWorkspaceRoot() {
        const root = vscode.workspace.workspaceFolders?.[0];
        return root ? root.uri.fsPath : null;
    }
    setPromptTemplate(template) {
        this.promptTemplate = template;
        (0, fileTrackerStorage_1.savePromptTemplate)(this.context, this.promptTemplate);
        this.onChange();
    }
    resetPromptTemplate() {
        this.promptTemplate = '';
        (0, fileTrackerStorage_1.savePromptTemplate)(this.context, this.promptTemplate);
        this.onChange();
    }
    setBatchPromptTemplate(template) {
        this.batchPromptTemplate = template;
        (0, fileTrackerStorage_1.saveBatchPromptTemplate)(this.context, this.batchPromptTemplate);
        this.onChange();
    }
    resetBatchPromptTemplate() {
        this.batchPromptTemplate = '';
        (0, fileTrackerStorage_1.saveBatchPromptTemplate)(this.context, this.batchPromptTemplate);
        this.onChange();
    }
    updateIgnoreGitIgnore(enabled) {
        this.scanSettings.ignoreGitIgnore = enabled;
        (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
        this.onChange();
    }
    updateMaxFilesToScan(value) {
        this.scanSettings.maxFilesToScan = value && value > 0 ? Math.floor(value) : null;
        (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
        this.onChange();
    }
    updateHideFolders(enabled) {
        this.scanSettings.hideFolders = enabled;
        (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
        this.onChange();
    }
    updateHideFoldersWhileSearching(enabled) {
        this.scanSettings.hideFoldersWhileSearching = enabled;
        (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
        this.onChange();
    }
    addIgnoredFolder(folder) {
        const normalized = (0, fileTrackerPathUtils_1.normalizeFolderPath)(folder);
        if (!normalized) {
            return;
        }
        if (!this.scanSettings.ignoredFolders.includes(normalized)) {
            this.scanSettings.ignoredFolders.push(normalized);
            this.scanSettings.ignoredFolders.sort((a, b) => a.localeCompare(b));
            (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
            this.onChange();
        }
    }
    removeIgnoredFolder(folder) {
        const normalized = (0, fileTrackerPathUtils_1.normalizeFolderPath)(folder);
        const next = this.scanSettings.ignoredFolders.filter(existing => existing !== normalized);
        if (next.length !== this.scanSettings.ignoredFolders.length) {
            this.scanSettings.ignoredFolders = next;
            (0, fileTrackerStorage_1.saveScanSettings)(this.context, this.scanSettings);
            this.onChange();
        }
    }
    updateThreshold(languageId, lines) {
        const config = this.configs.find(item => item.languageId === languageId);
        if (config) {
            config.lines = lines;
            (0, fileTrackerStorage_1.saveConfigs)(this.context, this.configs);
            this.onChange();
        }
    }
    addCustomConfig(extension, lines) {
        const ext = extension.startsWith('.') ? extension.slice(1) : extension;
        const extWithDot = `.${ext}`;
        const languageId = `custom:${extWithDot}`;
        const existing = this.configs.find(item => item.languageId === languageId);
        if (existing) {
            existing.lines = lines;
        }
        else {
            this.configs.push({
                languageId,
                displayName: ext.toUpperCase(),
                extension: extWithDot,
                lines,
                isCustom: true,
            });
        }
        (0, fileTrackerStorage_1.saveConfigs)(this.context, this.configs);
        this.onChange();
    }
    removeCustomConfig(languageId) {
        this.configs = this.configs.filter(config => !(config.languageId === languageId && config.isCustom));
        (0, fileTrackerStorage_1.saveConfigs)(this.context, this.configs);
        this.onChange();
    }
    getThreshold(languageIdOrDoc, fileName) {
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
        return defaultConfig.get('defaultThreshold', 300);
    }
    async ignoreForLines(filePath, currentLines, extraLines) {
        await this.ignoreService.ignoreForLines(filePath, currentLines, extraLines);
    }
    async ignoreForever(filePath) {
        await this.ignoreService.ignoreForever(filePath);
    }
    removeFileFromLastScan(filePath) {
        const normalizedTarget = (0, fileTrackerPathUtils_1.normalizeFilePath)(filePath);
        this.lastScanResults = this.lastScanResults.filter(file => (0, fileTrackerPathUtils_1.normalizeFilePath)(file.filePath) !== normalizedTarget);
    }
    removeFolderFromLastScan(folder) {
        const normalizedFolder = (0, fileTrackerPathUtils_1.normalizeFolderPath)(folder);
        if (!normalizedFolder) {
            return;
        }
        const root = this.getWorkspaceRoot();
        if (!root) {
            return;
        }
        const prefix = `${normalizedFolder}/`;
        this.lastScanResults = this.lastScanResults.filter(file => {
            const relativePath = (0, fileTrackerPathUtils_1.normalizeFolderPath)(path.relative(root, file.filePath));
            return relativePath !== normalizedFolder && !relativePath.startsWith(prefix);
        });
    }
    unignore(filePath) {
        this.ignoreService.unignore(filePath);
    }
    removeLineBonus(filePath) {
        this.ignoreService.removeLineBonus(filePath);
    }
    cancelPermanentIgnore(filePath) {
        this.ignoreService.cancelPermanentIgnore(filePath);
    }
    getIgnoredFiles() {
        return this.ignoreService.getIgnoredFiles();
    }
    async getOverThresholdFiles(force = false) {
        const scan = await this.scanService.getOverThresholdFiles(this.lastScanAt, this.lastScanResults, force);
        this.lastScanAt = scan.lastScanAt;
        this.lastScanResults = scan.lastScanResults;
        return scan.results;
    }
    async getDocumentByPath(filePath) {
        const normalizedTarget = (0, fileTrackerPathUtils_1.normalizeFilePath)(filePath);
        const openDocument = vscode.workspace.textDocuments.find(document => (0, fileTrackerPathUtils_1.normalizeFilePath)(document.fileName) === normalizedTarget);
        if (openDocument) {
            return openDocument;
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
