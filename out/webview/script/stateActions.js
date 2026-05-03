"use strict";
'use strict';
const vscode = acquireVsCodeApi();
const LOADING_MESSAGES = [
    'Sending the scanning bots out...',
    'Sweeping for code bloat...',
    'Polishing refactor radar lenses...',
    'Negotiating with suspiciously long files...',
    'Plotting a cleaner code trajectory...',
    'Triangulating hotspots in your codebase...'
];
const PUZZLE_SIZE = 4;
const PUZZLE_CELL_COUNT = PUZZLE_SIZE * PUZZLE_SIZE;
let state = {
    files: [],
    ignoredFiles: [],
    configs: [],
    scanSettings: {
        ignoreGitIgnore: true,
        maxFilesToScan: null,
        ignoredFolders: [],
        hideFolders: false,
        hideFoldersWhileSearching: true,
        expandFoldersOnToggle: true,
        showLineCount: true,
        limitDisplayMode: 'customOnly',
    },
    workspaceRoot: null,
    isLoading: true,
    loadingProgress: 0,
    promptTemplate: '',
    promptVariables: [],
    batchPromptTemplate: '',
    batchPromptVariables: [],
    defaultBatchPromptTemplate: '',
    defaultPromptTemplate: '',
};
const initialState = window.__STATE__;
if (initialState) {
    state = initialState;
}
const state2 = {
    collapsed: { files: false, settings: false },
    activeTab: 'alerts',
    configsSubTab: 'language',
    alertsSearch: '',
    alertsSort: 'overageDesc',
    ignoredSearch: '',
    configsSearch: '',
    expandedFolders: new Set(),
    activeFolderPrompt: null,
    activeFileCard: null,
};
let loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
let loadingMessageTimer;
let loadingProgressTimer;
let loadingPuzzle = createLoadingPuzzle();
const emit = (msg) => vscode.postMessage(msg);
function normalizeRelativePath(value) {
    return value
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');
}
function normalizeAbsolutePath(value) {
    const normalized = value.replace(/\\/g, '/');
    return /^[a-zA-Z]:/.test(normalized) ? normalized.toLowerCase() : normalized;
}
function getWorkspaceRelativePath(filePath) {
    const rootPath = state.workspaceRoot;
    if (!rootPath) {
        return normalizeRelativePath(filePath);
    }
    const normalizedRoot = normalizeAbsolutePath(rootPath).replace(/\/+$/, '');
    const normalizedFile = normalizeAbsolutePath(filePath);
    if (normalizedFile === normalizedRoot) {
        return '';
    }
    if (normalizedFile.startsWith(normalizedRoot + '/')) {
        return normalizeRelativePath(normalizedFile.slice(normalizedRoot.length + 1));
    }
    if (normalizedFile.startsWith(normalizedRoot)) {
        return normalizeRelativePath(normalizedFile.slice(normalizedRoot.length));
    }
    return normalizeRelativePath(normalizedFile);
}
function restoreIgnoredFileToAlerts(filePath) {
    const ignoredFile = state.ignoredFiles.find(f => f.filePath === filePath);
    if (ignoredFile && ignoredFile.cachedLineCount !== undefined && ignoredFile.cachedThreshold !== undefined) {
        state.files = [...state.files, {
                filePath: ignoredFile.filePath,
                fileName: ignoredFile.fileName,
                lineCount: ignoredFile.cachedLineCount,
                threshold: ignoredFile.cachedThreshold,
                overage: ignoredFile.cachedOverage || 0,
                isCustomLimit: false
            }];
    }
}
function optimisticIgnoreFile(filePath, kind, untilLines, bonusLines) {
    const file = state.files.find(f => f.filePath === filePath);
    if (!file) {
        return;
    }
    state.files = state.files.filter(f => f.filePath !== filePath);
    state.ignoredFiles = [...state.ignoredFiles, {
            filePath,
            fileName: file.fileName,
            kind,
            untilLines,
            bonusLines,
            cachedLineCount: file.lineCount,
            cachedThreshold: file.threshold,
            cachedOverage: file.overage
        }];
    renderRoot();
}
function upsertPredictedCustomConfig(extension, lines) {
    const ext = extension.startsWith('.') ? extension.slice(1) : extension;
    const extWithDot = '.' + ext;
    const languageId = 'custom:' + extWithDot;
    const existing = state.configs.find(cfg => cfg.languageId === languageId);
    if (existing) {
        existing.lines = lines;
        existing.isCustom = true;
        existing.extension = extWithDot;
        existing.displayName = ext.toUpperCase();
    }
    else {
        state.configs = [
            ...state.configs,
            {
                languageId,
                displayName: ext.toUpperCase(),
                extension: extWithDot,
                lines,
                isCustom: true,
            },
        ];
    }
}
function removePredictedCustomConfig(languageId) {
    state.configs = state.configs.filter(cfg => !(cfg.languageId === languageId && cfg.isCustom));
}
function removePredictedIgnoredFolder(folderPath) {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) {
        return;
    }
    const prefix = normalized + '/';
    state.files = state.files.filter(file => {
        const relativePath = getWorkspaceRelativePath(file.filePath);
        return relativePath !== normalized && !relativePath.startsWith(prefix);
    });
    state2.expandedFolders.delete(normalized);
    if (state2.activeFolderPrompt && (state2.activeFolderPrompt === normalized || state2.activeFolderPrompt.startsWith(prefix))) {
        state2.activeFolderPrompt = null;
    }
}
function expandFoldersForFile(filePath) {
    const segments = normalizeFolderSegments(filePath);
    if (segments.length === 0) {
        return;
    }
    let current = '';
    for (const segment of segments) {
        current = current ? current + '/' + segment : segment;
        state2.expandedFolders.add(current);
    }
}
function expandFolderTree(folderPath) {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) {
        return;
    }
    const folderPrefix = normalized + '/';
    const allFiles = state.files;
    for (const file of allFiles) {
        const relative = getWorkspaceRelativePath(file.filePath);
        if (relative === normalized || relative.startsWith(folderPrefix)) {
            expandFoldersForFile(file.filePath);
            state2.expandedFolders.add(normalized);
        }
    }
}
const actions = {
    openFile: (filePath) => emit({ type: 'openFile', filePath }),
    ignoreForLines: (filePath, lineCount) => {
        optimisticIgnoreFile(filePath, 'lines', lineCount + 200, 200);
        emit({ type: 'ignoreForLines', filePath, lineCount, extra: 200 });
    },
    ignoreForever: (filePath) => {
        optimisticIgnoreFile(filePath, 'forever');
        emit({ type: 'ignoreForever', filePath });
    },
    removeLineBonus: (filePath) => {
        restoreIgnoredFileToAlerts(filePath);
        state.ignoredFiles = state.ignoredFiles.filter(f => f.filePath !== filePath);
        renderRoot();
        emit({ type: 'removeLineBonus', filePath });
    },
    cancelPermanentIgnore: (filePath) => {
        restoreIgnoredFileToAlerts(filePath);
        state.ignoredFiles = state.ignoredFiles.filter(f => f.filePath !== filePath);
        renderRoot();
        emit({ type: 'cancelPermanentIgnore', filePath });
    },
    copyPrompt: (filePath, fileData) => emit({ type: 'copyPrompt', filePath, fileData }),
    copyFolderPrompt: (folderName, filePaths) => emit({ type: 'copyBatchPrompt', folderName, filePaths }),
    updateThreshold: (languageId, value) => {
        const lines = parseInt(value, 10);
        if (!isNaN(lines) && lines > 0)
            emit({ type: 'updateThreshold', languageId, lines });
    },
    removeCustom: (languageId) => emit({ type: 'removeCustom', languageId }),
    setActiveFileCard: (filePath) => {
        state2.activeFileCard = filePath;
        renderRoot();
    },
    toggleFileCard: (filePath) => {
        if (!filePath) {
            return;
        }
        state2.activeFileCard = state2.activeFileCard === filePath ? null : filePath;
        if (state2.activeFileCard && state2.alertsSearch.trim() && !state.scanSettings.hideFolders && state.scanSettings.hideFoldersWhileSearching) {
            expandFoldersForFile(state2.activeFileCard);
        }
        renderRoot();
    },
    addCustom: () => {
        const extInput = document.getElementById('new-ext');
        const linesInput = document.getElementById('new-lines');
        const errEl = document.getElementById('add-error');
        if (!extInput || !linesInput)
            return;
        const ext = extInput.value.trim().replace(/^\.+/, '');
        const lines = parseInt(linesInput.value, 10);
        errEl.textContent = '';
        if (!ext || !/^[a-zA-Z0-9]+$/.test(ext)) {
            errEl.textContent = 'Enter a valid extension (e.g. rb, go, ts)';
            return;
        }
        if (isNaN(lines) || lines < 10) {
            errEl.textContent = 'Enter a line threshold >= 10';
            return;
        }
        const extension = '.' + ext;
        upsertPredictedCustomConfig(extension, lines);
        state2.configsSubTab = 'language';
        renderRoot();
        emit({ type: 'addCustom', extension, lines });
    },
    switchTab: (tab) => { state2.activeTab = tab; renderRoot(); },
    switchConfigTab: (tab) => { state2.configsSubTab = tab; renderRoot(); },
    updateConfigsSection: (value) => {
        state2.configsSubTab = value === 'ignore' || value === 'scan' ? value : 'language';
        renderRoot();
    },
    toggleSection: (name) => { state2.collapsed[name] = !state2.collapsed[name]; renderRoot(); },
    updateIgnoredSearch: (value) => { state2.ignoredSearch = value; renderRoot(); },
    updateAlertsSearch: (value) => {
        const previous = state2.alertsSearch.trim();
        state2.alertsSearch = value;
        const next = state2.alertsSearch.trim();
        if (previous && !next && state2.activeFileCard && !state.scanSettings.hideFolders && state.scanSettings.hideFoldersWhileSearching) {
            expandFoldersForFile(state2.activeFileCard);
        }
        renderRoot();
    },
    updateAlertsSort: (value) => {
        state2.alertsSort = value === 'overageAsc' ? 'overageAsc' : 'overageDesc';
        renderRoot();
    },
    toggleFolderExpand: (folderPath) => {
        if (!folderPath) {
            return;
        }
        if (state2.expandedFolders.has(folderPath)) {
            state2.expandedFolders.delete(folderPath);
        }
        else {
            if (state.scanSettings.expandFoldersOnToggle) {
                expandFolderTree(folderPath);
            }
            else {
                state2.expandedFolders.add(folderPath);
            }
        }
        renderRoot();
    },
    toggleFolderPrompt: (folderPath) => {
        if (!folderPath) {
            return;
        }
        state2.activeFolderPrompt = state2.activeFolderPrompt === folderPath ? null : folderPath;
        renderRoot();
    },
    updateConfigsSearch: (value) => { state2.configsSearch = value; renderRoot(); },
    updateIgnoreGitIgnore: (enabled) => {
        state.scanSettings.ignoreGitIgnore = enabled;
        renderRoot();
        emit({ type: 'updateIgnoreGitIgnore', enabled });
    },
    updateMaxFilesToScan: (value) => {
        const parsed = parseInt(value, 10);
        const maxFilesToScan = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        state.scanSettings.maxFilesToScan = maxFilesToScan;
        renderRoot();
        emit({ type: 'updateMaxFilesToScan', maxFilesToScan });
    },
    updateHideFolders: (enabled) => {
        state.scanSettings.hideFolders = enabled;
        renderRoot();
        emit({ type: 'updateHideFolders', enabled });
    },
    updateHideFoldersWhileSearching: (enabled) => {
        state.scanSettings.hideFoldersWhileSearching = enabled;
        renderRoot();
        emit({ type: 'updateHideFoldersWhileSearching', enabled });
    },
    updateExpandFoldersOnToggle: (enabled) => {
        vscode.postMessage({ type: 'updateExpandFoldersOnToggle', enabled });
        state.scanSettings.expandFoldersOnToggle = enabled;
        renderRoot();
    },
    updateShowLineCount: (enabled) => {
        vscode.postMessage({ type: 'updateShowLineCount', enabled });
        state.scanSettings.showLineCount = enabled;
        renderRoot();
    },
    updateLimitDisplayMode: (mode) => {
        vscode.postMessage({ type: 'updateLimitDisplayMode', mode });
        state.scanSettings.limitDisplayMode = mode;
        renderRoot();
    },
    addIgnoredFolder: () => {
        const folderInput = document.getElementById('new-folder');
        const errEl = document.getElementById('folder-error');
        if (!folderInput || !errEl) {
            return;
        }
        const folder = normalizeRelativePath(folderInput.value);
        errEl.textContent = '';
        if (!folder) {
            errEl.textContent = 'Enter a folder path.';
            return;
        }
        if (state.scanSettings.ignoredFolders.includes(folder)) {
            errEl.textContent = 'Folder already ignored.';
            return;
        }
        state.scanSettings.ignoredFolders = [...state.scanSettings.ignoredFolders, folder].sort((a, b) => a.localeCompare(b));
        folderInput.value = '';
        renderRoot();
        emit({ type: 'addIgnoredFolder', folder });
    },
    ignoreFolder: (folderPath) => {
        const normalized = normalizeRelativePath(folderPath);
        if (!normalized) {
            return;
        }
        if (state.scanSettings.ignoredFolders.includes(normalized)) {
            return;
        }
        removePredictedIgnoredFolder(normalized);
        state.scanSettings.ignoredFolders = [...state.scanSettings.ignoredFolders, normalized].sort((a, b) => a.localeCompare(b));
        renderRoot();
        emit({ type: 'addIgnoredFolder', folder: normalized });
    },
    removeIgnoredFolder: (folder) => {
        state.scanSettings.ignoredFolders = state.scanSettings.ignoredFolders.filter(item => item !== folder);
        renderRoot();
        emit({ type: 'removeIgnoredFolder', folder });
    },
    savePromptTemplate: () => {
        const textarea = document.getElementById('prompt-template');
        if (!textarea) {
            return;
        }
        emit({ type: 'savePromptTemplate', template: textarea.value });
    },
    saveBatchPromptTemplate: () => {
        const textarea = document.getElementById('batch-prompt-template');
        if (!textarea) {
            return;
        }
        emit({ type: 'saveBatchPromptTemplate', template: textarea.value });
    },
    resetPromptTemplate: () => emit({ type: 'resetPromptTemplate' }),
    resetBatchPromptTemplate: () => emit({ type: 'resetBatchPromptTemplate' }),
    insertPromptVariable: (variable) => {
        const textarea = document.getElementById('prompt-template');
        if (!textarea) {
            return;
        }
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        textarea.value = textarea.value.slice(0, start) + variable + textarea.value.slice(end);
        textarea.focus();
        const cursor = start + variable.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
    },
    insertBatchPromptVariable: (variable) => {
        const textarea = document.getElementById('batch-prompt-template');
        if (!textarea) {
            return;
        }
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        textarea.value = textarea.value.slice(0, start) + variable + textarea.value.slice(end);
        textarea.focus();
        const cursor = start + variable.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
    }
};
