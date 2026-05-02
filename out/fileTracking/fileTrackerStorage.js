"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfigs = loadConfigs;
exports.saveConfigs = saveConfigs;
exports.loadPromptTemplate = loadPromptTemplate;
exports.savePromptTemplate = savePromptTemplate;
exports.loadBatchPromptTemplate = loadBatchPromptTemplate;
exports.saveBatchPromptTemplate = saveBatchPromptTemplate;
exports.loadScanSettings = loadScanSettings;
exports.saveScanSettings = saveScanSettings;
exports.loadIgnoredFiles = loadIgnoredFiles;
exports.saveIgnoredFiles = saveIgnoredFiles;
exports.loadFileCache = loadFileCache;
exports.saveFileCache = saveFileCache;
const fileTrackerDefaults_1 = require("./fileTrackerDefaults");
const fileTrackerPathUtils_1 = require("./fileTrackerPathUtils");
function loadConfigs(context) {
    const saved = context.workspaceState.get('languageConfigs');
    if (saved && saved.length > 0) {
        return saved;
    }
    return fileTrackerDefaults_1.DEFAULT_LANGUAGE_CONFIGS.map(config => ({ ...config, isCustom: false }));
}
function saveConfigs(context, configs) {
    void context.workspaceState.update('languageConfigs', configs);
}
function loadPromptTemplate(context) {
    return context.workspaceState.get('promptTemplate', '');
}
function savePromptTemplate(context, template) {
    void context.workspaceState.update('promptTemplate', template);
}
function loadBatchPromptTemplate(context) {
    return context.workspaceState.get('batchPromptTemplate', '');
}
function saveBatchPromptTemplate(context, template) {
    void context.workspaceState.update('batchPromptTemplate', template);
}
function loadScanSettings(context) {
    const saved = context.workspaceState.get('scanSettings', {});
    return {
        ignoreGitIgnore: saved.ignoreGitIgnore ?? true,
        maxFilesToScan: typeof saved.maxFilesToScan === 'number' && saved.maxFilesToScan > 0
            ? Math.floor(saved.maxFilesToScan)
            : null,
        ignoredFolders: Array.isArray(saved.ignoredFolders)
            ? saved.ignoredFolders.filter(Boolean).map(folder => (0, fileTrackerPathUtils_1.normalizeFolderPath)(folder))
            : [],
        hideFolders: saved.hideFolders ?? false,
        hideFoldersWhileSearching: saved.hideFoldersWhileSearching ?? true,
        expandFoldersOnToggle: saved.expandFoldersOnToggle ?? true,
    };
}
function saveScanSettings(context, scanSettings) {
    void context.workspaceState.update('scanSettings', scanSettings);
}
function loadIgnoredFiles(context) {
    const saved = context.workspaceState.get('ignoredFiles', {});
    return new Map(Object.entries(saved));
}
function saveIgnoredFiles(context, ignoreMap) {
    const serialized = Object.fromEntries(ignoreMap.entries());
    void context.workspaceState.update('ignoredFiles', serialized);
}
function loadFileCache(context) {
    const saved = context.workspaceState.get('fileCache', {});
    return {
        byPath: new Map(Object.entries(saved.byPath || {})),
        byIdentity: new Map(Object.entries(saved.byIdentity || {})),
    };
}
function saveFileCache(context, byPath, byIdentity) {
    const serialized = {
        byPath: Object.fromEntries(byPath.entries()),
        byIdentity: Object.fromEntries(byIdentity.entries()),
    };
    void context.workspaceState.update('fileCache', serialized);
}
