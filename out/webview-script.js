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
const utils = {
    escHtml: (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    getSeverity: (file) => file.overage > file.threshold * 0.5 ? 'error' : 'warn'
};
function pickLoadingMessage(previous) {
    if (LOADING_MESSAGES.length < 2) {
        return LOADING_MESSAGES[0] || 'Loading...';
    }
    let next = previous;
    while (next === previous) {
        next = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    }
    return next;
}
function applyPuzzleMove(cells, index) {
    const row = Math.floor(index / PUZZLE_SIZE);
    const col = index % PUZZLE_SIZE;
    const positions = [
        [row, col],
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
    ];
    for (const [r, c] of positions) {
        if (r >= 0 && r < PUZZLE_SIZE && c >= 0 && c < PUZZLE_SIZE) {
            const idx = r * PUZZLE_SIZE + c;
            cells[idx] = !cells[idx];
        }
    }
}
function createLoadingPuzzle() {
    const cells = Array.from({ length: PUZZLE_CELL_COUNT }, () => false);
    const steps = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < steps; i++) {
        applyPuzzleMove(cells, Math.floor(Math.random() * PUZZLE_CELL_COUNT));
    }
    if (cells.every(cell => !cell)) {
        applyPuzzleMove(cells, Math.floor(Math.random() * PUZZLE_CELL_COUNT));
    }
    return cells;
}
function isPuzzleSolved() {
    return loadingPuzzle.every(cell => !cell);
}
function loadingPuzzleMarkup() {
    const rows = Array.from({ length: PUZZLE_SIZE }, (_, row) => {
        const cols = Array.from({ length: PUZZLE_SIZE }, (_, col) => {
            const index = row * PUZZLE_SIZE + col;
            const symbol = loadingPuzzle[index] ? '[*]' : '[ ]';
            const pressed = loadingPuzzle[index] ? 'true' : 'false';
            return '<button class="puzzle-cell" data-action="togglePuzzle" data-index="' + index + '" aria-pressed="' + pressed + '">' + symbol + '</button>';
        }).join('');
        return '<div class="puzzle-row">' + cols + '</div>';
    }).join('');
    return '<div id="loading-puzzle-grid" class="loading-puzzle-grid">' + rows + '</div>';
}
function syncLoadingPuzzleToDom() {
    const puzzleEl = document.getElementById('loading-puzzle');
    if (puzzleEl) {
        puzzleEl.innerHTML = loadingPuzzleMarkup();
    }
}
function toggleLoadingPuzzle(index) {
    if (!state.isLoading || Number.isNaN(index) || index < 0 || index >= PUZZLE_CELL_COUNT) {
        return;
    }
    applyPuzzleMove(loadingPuzzle, index);
    syncLoadingPuzzleToDom();
    if (isPuzzleSolved()) {
        loadingPuzzle = createLoadingPuzzle();
        syncLoadingPuzzleToDom();
    }
}
function syncLoadingMessageToDom() {
    const loadingEl = document.getElementById('loading-message');
    if (loadingEl) {
        loadingEl.textContent = loadingMessage;
    }
}
function ensureLoadingMessageTimer() {
    if (state.isLoading) {
        if (loadingMessageTimer === undefined) {
            loadingMessage = pickLoadingMessage('');
            syncLoadingMessageToDom();
            loadingMessageTimer = window.setInterval(() => {
                loadingMessage = pickLoadingMessage(loadingMessage);
                syncLoadingMessageToDom();
            }, 1600);
        }
        return;
    }
    if (loadingMessageTimer !== undefined) {
        window.clearInterval(loadingMessageTimer);
        loadingMessageTimer = undefined;
    }
}
function syncLoadingProgressToDom() {
    const progress = state.isLoading ? Math.max(8, Math.min(96, Number(state.loadingProgress || 0))) : 100;
    const progressEl = document.getElementById('loading-progress');
    if (progressEl) {
        progressEl.textContent = progress + '%';
    }
    const fillEl = document.getElementById('loading-progress-fill');
    if (fillEl) {
        fillEl.style.width = progress + '%';
    }
}
function ensureLoadingProgressTimer() {
    if (state.isLoading) {
        if (loadingProgressTimer === undefined) {
            loadingProgressTimer = window.setInterval(() => {
                const current = Math.max(8, Math.min(96, Number(state.loadingProgress || 0)));
                state.loadingProgress = Math.min(96, current + Math.max(1, Math.floor(Math.random() * 5)));
                syncLoadingProgressToDom();
            }, 250);
        }
        syncLoadingProgressToDom();
        return;
    }
    if (loadingProgressTimer !== undefined) {
        window.clearInterval(loadingProgressTimer);
        loadingProgressTimer = undefined;
    }
    state.loadingProgress = 100;
    syncLoadingProgressToDom();
}
function takeFocusSnapshot() {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !active.id) {
        return null;
    }
    return {
        id: active.id,
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
    };
}
function restoreFocusSnapshot(snapshot) {
    if (!snapshot) {
        return;
    }
    const next = document.getElementById(snapshot.id);
    if (!(next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)) {
        return;
    }
    next.focus();
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
        next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
}
function normalizeFolderSegments(filePath) {
    const relative = getWorkspaceRelativePath(filePath);
    const parts = relative
        .split('/')
        .filter(Boolean)
        .filter(segment => segment !== '.' && segment !== '..');
    return parts.slice(0, Math.max(0, parts.length - 1));
}
function getCommonPrefixLength(segmentsList) {
    if (segmentsList.length === 0) {
        return 0;
    }
    const minLength = Math.min(...segmentsList.map(segments => segments.length));
    let prefixLength = 0;
    for (let i = 0; i < minLength; i++) {
        const segment = segmentsList[0][i];
        if (segmentsList.every(segments => segments[i] === segment)) {
            prefixLength++;
            continue;
        }
        break;
    }
    if (prefixLength > 0 && segmentsList.every(segments => segments.length === prefixLength)) {
        prefixLength -= 1;
    }
    return Math.max(0, prefixLength);
}
function getAllNodePaths(node) {
    const nested = Array.from(node.children.values()).flatMap(getAllNodePaths);
    return [...node.files.map(file => file.filePath), ...nested];
}
function computeAlertCounts(node) {
    const childCount = Array.from(node.children.values()).reduce((sum, child) => sum + computeAlertCounts(child), 0);
    node.alertCount = node.files.length + childCount;
    return node.alertCount;
}
function buildFolderTree(files) {
    const root = { name: '', path: '', files: [], children: new Map(), alertCount: 0 };
    const normalizedSegments = files.map(file => normalizeFolderSegments(file.filePath));
    const prefixLength = getCommonPrefixLength(normalizedSegments);
    const prefixPath = normalizedSegments.length > 0
        ? normalizedSegments[0].slice(0, prefixLength).join('/')
        : '';
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const segments = normalizedSegments[index].slice(prefixLength);
        let current = root;
        let runningPath = '';
        for (const segment of segments) {
            runningPath = runningPath ? runningPath + '/' + segment : segment;
            const fullPath = prefixPath ? prefixPath + '/' + runningPath : runningPath;
            if (!current.children.has(segment)) {
                current.children.set(segment, {
                    name: segment,
                    path: fullPath,
                    files: [],
                    children: new Map(),
                    alertCount: 0,
                });
            }
            current = current.children.get(segment);
        }
        current.files.push(file);
    }
    computeAlertCounts(root);
    return root;
}
const render = {
    fileCard: (file) => {
        const { escHtml } = utils;
        const encodedPath = encodeURIComponent(file.filePath);
        const isActive = state2.activeFileCard === file.filePath;
        const relativePath = getWorkspaceRelativePath(file.filePath);
        const displayPath = relativePath || file.filePath;
        const displayMode = state.scanSettings.limitDisplayMode || 'customOnly';
        let showLimit = false;
        if (displayMode === 'always')
            showLimit = true;
        else if (displayMode === 'customOnly')
            showLimit = file.isCustomLimit;
        else if (displayMode === 'off')
            showLimit = false;
        const showLineCount = state.scanSettings.showLineCount !== false;
        return '<details class="file-card alert-node"' + (isActive ? ' open' : '') + '>' +
            '<summary class="alert-summary" data-action="toggleFileCard" data-file="' + escHtml(encodedPath) + '">' +
            '<div class="file-meta">' +
            '<span class="file-name" title="' + escHtml(displayPath) + '" data-action="openFile" data-file="' + escHtml(encodedPath) + '">' + escHtml(file.fileName) + '</span>' +
            '</div>' +
            '<div class="file-stats">' +
            (showLineCount ? '<span>' + file.lineCount + ' lines</span>' : '') +
            (showLimit ? '<span>limit: ' + file.threshold + '</span>' : '') +
            '<span class="overage">+' + file.overage + ' over</span>' +
            '</div>' +
            '<span class="alert-chevron" aria-hidden="true">▸</span>' +
            '</summary>' +
            '<div class="file-actions">' +
            '<div class="file-actions-row">' +
            '<button class="btn-primary" data-action="copyPrompt" data-file="' + escHtml(encodedPath) + '">Copy AI Prompt</button>' +
            '</div>' +
            '<div class="file-actions-row">' +
            '<span class="ignore-label">Ignore:</span>' +
            '<button class="btn-ghost btn-md" data-action="ignoreForLines" data-file="' + escHtml(encodedPath) + '" data-linecount="' + file.lineCount + '">+ 200</button>' +
            '<button class="btn-ghost btn-md" data-action="ignoreForever" data-file="' + escHtml(encodedPath) + '">all</button>' +
            '</div>' +
            '</div>' +
            '</details>';
    },
    folderNode: (node) => {
        const childMarkup = Array.from(node.children.values())
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(child => render.folderNode(child))
            .join('');
        const fileMarkup = [...node.files]
            .sort((a, b) => {
            if (state2.alertsSort === 'overageAsc') {
                return a.overage - b.overage;
            }
            return b.overage - a.overage;
        })
            .map(render.fileCard)
            .join('');
        const allPaths = getAllNodePaths(node);
        const isExpanded = state2.expandedFolders.has(node.path);
        const showFolderPrompt = state2.activeFolderPrompt === node.path;
        return '<div class="folder-node">' +
            '<div class="folder-summary">' +
            '<button class="folder-toggle" data-action="toggleFolderExpand" data-folder="' + utils.escHtml(encodeURIComponent(node.path)) + '" aria-label="Toggle folder" aria-expanded="' + (isExpanded ? 'true' : 'false') + '">' +
            '<span class="folder-arrow" aria-hidden="true">' + (isExpanded ? '▾' : '▸') + '</span>' +
            '</button>' +
            '<button class="folder-main-btn" data-action="toggleFolderPrompt" data-folder="' + utils.escHtml(encodeURIComponent(node.path)) + '">' +
            '<span class="folder-title">' +
            '<span class="folder-icon" aria-hidden="true">' +
            '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false">' +
            '<path fill="currentColor" d="M1.5 3.5h4.1l1.1 1.5h7.8v7.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" opacity="0.85"></path>' +
            '</svg>' +
            '</span>' +
            '<span>' + utils.escHtml(node.name) + '</span>' +
            '<span class="folder-count">' + node.alertCount + '</span>' +
            '</span>' +
            '</button>' +
            '<span class="folder-actions">' +
            (showFolderPrompt
                ? '<button class="btn-secondary btn-sm" data-action="copyFolderPrompt" data-folder="' + utils.escHtml(encodeURIComponent(node.path)) + '" data-files="' + utils.escHtml(encodeURIComponent(JSON.stringify(allPaths))) + '">Copy Prompt</button>' +
                    '<button class="btn-ghost btn-sm" data-action="ignoreFolder" data-folder="' + utils.escHtml(encodeURIComponent(node.path)) + '">Ignore</button>'
                : '') +
            '</span>' +
            '</div>' +
            '<div class="folder-children ' + (isExpanded ? '' : 'collapsed') + '">' + childMarkup + fileMarkup + '</div>' +
            '</div>';
    },
    thresholdRow: (cfg) => {
        const { escHtml } = utils;
        const customClass = cfg.isCustom ? ' custom-lang' : '';
        let row = '<tr><td><div class="lang-name' + customClass + '">' + escHtml(cfg.displayName);
        row += '</div><div class="lang-ext">' + escHtml(cfg.extension) + '</div></td>';
        row += '<td><input type="number" value="' + cfg.lines + '" min="10" max="9999" data-action="updateThreshold" data-language="' + escHtml(cfg.languageId) + '" /></td>';
        row += '<td>' + (cfg.isCustom ? '<button class="btn-danger btn-sm" data-action="removeCustom" data-language="' + escHtml(cfg.languageId) + '">X</button>' : '') + '</td></tr>';
        return row;
    },
    ignoredCard: (file) => {
        const { escHtml } = utils;
        const encodedPath = encodeURIComponent(file.filePath);
        const isForever = file.kind === 'forever';
        const relativePath = getWorkspaceRelativePath(file.filePath);
        const displayPath = relativePath || file.filePath;
        const details = isForever
            ? 'This file is hidden from alerts until you cancel permanent ignore.'
            : '+' + (file.bonusLines ?? 0) + ' lines applied (max ' + (file.untilLines ?? 0) + ' lines)';
        const action = isForever
            ? '<button class="btn-danger btn-sm" data-action="cancelPermanentIgnore" data-file="' + escHtml(encodedPath) + '">Cancel permanent ignore</button>'
            : '<button class="btn-secondary btn-sm" data-action="removeLineBonus" data-file="' + escHtml(encodedPath) + '">Remove line bonus</button>';
        return '<div class="file-card">' +
            '<div class="file-meta">' +
            '<span class="file-name" title="' + escHtml(displayPath) + '" data-action="openFile" data-file="' + escHtml(encodedPath) + '">' + escHtml(file.fileName) + '</span>' +
            '</div>' +
            '<div class="ignored-details">' + escHtml(details) + '</div>' +
            '<div class="file-actions">' +
            '<button class="btn-ghost btn-sm" data-action="openFile" data-file="' + escHtml(encodedPath) + '">Open File</button>' +
            action +
            '</div>' +
            '</div>';
    },
    root: () => {
        const loadingProgress = state.isLoading ? Math.max(8, Math.min(96, Number(state.loadingProgress || 0))) : 100;
        const loadingState = '<div class="loading-state ' + (state.isLoading ? 'visible' : '') + '">' +
            '<div class="loading-title">Loading extension state...</div>' +
            '<div id="loading-progress" class="loading-progress">' + loadingProgress + '%</div>' +
            '<div class="loading-progress-track"><div id="loading-progress-fill" class="loading-progress-fill" style="width:' + loadingProgress + '%"></div></div>' +
            '<div id="loading-message" class="loading-message">' + utils.escHtml(loadingMessage) + '</div>' +
            '<div id="loading-puzzle" class="loading-puzzle">' + loadingPuzzleMarkup() + '</div>' +
            '</div>';
        const contentClass = state.isLoading ? 'content-hidden' : '';
        const files = state.files;
        const ignoredFiles = state.ignoredFiles;
        const configs = state.configs;
        const { collapsed, activeTab } = state2;
        const ignoredSearch = state2.ignoredSearch.trim().toLowerCase();
        const filteredIgnoredFiles = ignoredSearch
            ? ignoredFiles.filter(file => file.fileName.toLowerCase().includes(ignoredSearch) ||
                file.filePath.toLowerCase().includes(ignoredSearch))
            : ignoredFiles;
        const configsSearch = state2.configsSearch.trim().toLowerCase();
        const filteredConfigs = configsSearch
            ? configs.filter(cfg => cfg.displayName.toLowerCase().includes(configsSearch) ||
                cfg.extension.toLowerCase().includes(configsSearch))
            : configs;
        const sortedConfigs = [...filteredConfigs].sort((a, b) => {
            if (a.isCustom && !b.isCustom)
                return -1;
            if (!a.isCustom && b.isCustom)
                return 1;
            return a.displayName.localeCompare(b.displayName);
        });
        const nav = '<div class="nav-bar">' +
            '<button class="nav-tab ' + (activeTab === 'alerts' ? 'active' : '') + '" data-action="switchTab" data-tab="alerts">Alerts</button>' +
            '<button class="nav-tab ' + (activeTab === 'configs' ? 'active' : '') + '" data-action="switchTab" data-tab="configs">Configs</button>' +
            '<button class="nav-tab ' + (activeTab === 'prompts' ? 'active' : '') + '" data-action="switchTab" data-tab="prompts">Prompts</button>' +
            '</div>';
        const alertsSearch = state2.alertsSearch.trim().toLowerCase();
        const searchedFiles = alertsSearch
            ? files.filter(file => file.fileName.toLowerCase().includes(alertsSearch) ||
                file.filePath.toLowerCase().includes(alertsSearch))
            : files;
        const filteredFiles = [...searchedFiles].sort((a, b) => {
            if (state2.alertsSort === 'overageAsc') {
                return a.overage - b.overage;
            }
            return b.overage - a.overage;
        });
        const folderTree = buildFolderTree(filteredFiles);
        const folderMarkup = (state.scanSettings.hideFolders || (state.scanSettings.hideFoldersWhileSearching && !!alertsSearch))
            ? filteredFiles.map(render.fileCard).join('')
            : folderTree.files.map(render.fileCard).join('') + Array.from(folderTree.children.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(render.folderNode)
                .join('');
        const filesSection = '<div class="section-header" data-action="toggleSection" data-section="files">' +
            '<span>Files Over Threshold</span>' +
            (files.length > 0 ? '<span class="badge">' + files.length + '</span>' : '') +
            '<span class="chevron ' + (collapsed.files ? 'collapsed' : '') + '">▾</span>' +
            '</div>' +
            '<div class="section-body ' + (collapsed.files ? 'collapsed' : '') + '">' +
            '<div class="alerts-toolbar">' +
            '<input type="text" id="alerts-search" class="alerts-search" placeholder="Search alerts..." value="' + utils.escHtml(state2.alertsSearch) + '" />' +
            '<div class="dropdown-container custom-dropdown" data-id="alerts-sort">' +
            '<div class="custom-select" tabindex="0">' +
            (state2.alertsSort === 'overageDesc' ? 'Most over first' : 'Least over first') +
            '</div>' +
            '<div class="dropdown-menu">' +
            '<div class="dropdown-item' + (state2.alertsSort === 'overageDesc' ? ' selected' : '') + '" data-value="overageDesc">Most over first</div>' +
            '<div class="dropdown-item' + (state2.alertsSort === 'overageAsc' ? ' selected' : '') + '" data-value="overageAsc">Least over first</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            (filteredFiles.length === 0
                ? '<div class="empty-state">All files are within their line thresholds or no results match your search.</div>'
                : folderMarkup) +
            '</div>';
        const configTabs = '<div class="settings-mode">' +
            '<label class="settings-mode-label" for="configs-section">Settings section</label>' +
            '<div class="dropdown-container custom-dropdown" data-id="configs-section">' +
            '<div class="custom-select" tabindex="0">' +
            (state2.configsSubTab === 'language' ? 'Language thresholds' :
                state2.configsSubTab === 'ignore' ? 'Ignored files' : 'General') +
            '</div>' +
            '<div class="dropdown-menu">' +
            '<div class="dropdown-item' + (state2.configsSubTab === 'language' ? ' selected' : '') + '" data-value="language">Language thresholds</div>' +
            '<div class="dropdown-item' + (state2.configsSubTab === 'ignore' ? ' selected' : '') + '" data-value="ignore">Ignored files</div>' +
            '<div class="dropdown-item' + (state2.configsSubTab === 'scan' ? ' selected' : '') + '" data-value="scan">General</div>' +
            '</div>' +
            '</div>' +
            '</div>';
        const languageView = '<div class="settings-body">' +
            '<p class="settings-description">Set the maximum line count per file type.</p>' +
            '<div class="configs-toolbar">' +
            '<input type="text" id="configs-search" class="configs-search" placeholder="Search languages..." value="' + utils.escHtml(state2.configsSearch) + '" />' +
            '</div>' +
            '<div class="add-custom-row settings-row-spaced">' +
            '<input type="text" id="new-ext" placeholder=".ext" maxlength="12" />' +
            '<input type="number" id="new-lines" placeholder="lines" min="10" max="9999" />' +
            '<button class="btn-primary" data-action="addCustom">Add custom</button>' +
            '</div>' +
            '<p id="add-error" class="error-msg"></p>' +
            '<table class="threshold-table"><thead><tr><th>Language</th><th>Max lines</th><th></th></tr></thead><tbody>' +
            sortedConfigs.map(render.thresholdRow).join('') +
            '</tbody></table>' +
            '</div>';
        const ignoreView = '<div class="settings-body">' +
            '<div class="ignored-toolbar ignored-toolbar-compact">' +
            '<input type="text" id="ignored-search" class="ignored-search" placeholder="Search ignored files..." value="' + utils.escHtml(state2.ignoredSearch) + '" />' +
            '</div>' +
            '<p class="settings-description">Manage ignored files and folders from one place.</p>' +
            '<div class="add-custom-row settings-row-spaced">' +
            '<input type="text" id="new-folder" class="folder-input" placeholder="folder/path" />' +
            '<button class="btn-primary" data-action="addFolder">Add Folder</button>' +
            '</div>' +
            '<p id="folder-error" class="error-msg"></p>' +
            '<div class="ignored-note ignored-note-compact">Ignored folders are relative to workspace root.</div>' +
            (state.scanSettings.ignoredFolders.length === 0
                ? '<div class="empty-state">No ignored folders yet.</div>'
                : '<div>' + state.scanSettings.ignoredFolders.map(folder => '<div class="file-card"><div class="file-meta"><span class="file-name" title="' + utils.escHtml(folder) + '">' + utils.escHtml(folder) + '</span></div>' +
                    '<div class="file-actions"><button class="btn-primary btn-sm" data-action="removeFolder" data-folder="' + utils.escHtml(folder) + '">Remove</button></div></div>').join('') + '</div>') +
            (filteredIgnoredFiles.length === 0
                ? '<div class="empty-state">' + (ignoredFiles.length === 0 ? 'No ignored files yet.' : 'No ignored files match your search.') + '</div>'
                : filteredIgnoredFiles.map(render.ignoredCard).join('')) +
            '</div>';
        const scanView = '<div class="settings-body">' +
            '<p class="settings-description">Control how scanning works for large repositories.</p>' +
            '<label class="scan-checkbox-row">' +
            '<input type="checkbox" id="toggle-gitignore" data-action="toggleGitIgnore" ' + (state.scanSettings.ignoreGitIgnore ? 'checked' : '') + ' />' +
            'Ignore files listed in .gitignore' +
            '</label>' +
            '<label class="scan-checkbox-row">' +
            '<input type="checkbox" id="toggle-hidefolders" data-action="toggleHideFolders" ' + (state.scanSettings.hideFolders ? 'checked' : '') + ' />' +
            'Hide folders' +
            '</label>' +
            '<label class="scan-checkbox-row">' +
            '<input type="checkbox" id="toggle-hidefolders-searching" data-action="toggleHideFoldersWhileSearching" ' + (state.scanSettings.hideFoldersWhileSearching ? 'checked' : '') + ' />' +
            'Hide folders when searching' +
            '</label>' +
            '<label class="scan-checkbox-row">' +
            '<input type="checkbox" id="toggle-expand-folders" data-action="toggleExpandFoldersOnToggle" ' + (state.scanSettings.expandFoldersOnToggle ? 'checked' : '') + ' />' +
            'Expand all nested folders on toggle' +
            '</label>' +
            '<label class="scan-checkbox-row">' +
            '<input type="checkbox" id="toggle-show-line-count" data-action="toggleShowLineCount" ' + (state.scanSettings.showLineCount !== false ? 'checked' : '') + ' />' +
            'Show line count on alerts' +
            '</label>' +
            '<label class="scan-field-label">Limit display mode</label>' +
            '<div class="dropdown-container custom-dropdown" data-id="limit-display-mode">' +
            '<div class="custom-select" tabindex="0">' +
            (state.scanSettings.limitDisplayMode === 'always' ? 'Always on' :
                state.scanSettings.limitDisplayMode === 'off' ? 'Off' : 'Custom limit only') +
            '</div>' +
            '<div class="dropdown-menu">' +
            '<div class="dropdown-item' + (state.scanSettings.limitDisplayMode === 'customOnly' || !state.scanSettings.limitDisplayMode ? ' selected' : '') + '" data-value="customOnly">Custom limit only</div>' +
            '<div class="dropdown-item' + (state.scanSettings.limitDisplayMode === 'off' ? ' selected' : '') + '" data-value="off">Off</div>' +
            '<div class="dropdown-item' + (state.scanSettings.limitDisplayMode === 'always' ? ' selected' : '') + '" data-value="always">Always on</div>' +
            '</div>' +
            '</div>' +
            '<label class="scan-field-label" style="margin-top: 12px;">Max files to scan (blank = unlimited)</label>' +
            '<input type="number" id="max-files-to-scan" min="1" placeholder="Unlimited" value="' + (state.scanSettings.maxFilesToScan ?? '') + '" class="scan-input" />' +
            '</div>';
        let activeConfigView = '';
        if (state2.configsSubTab === 'language')
            activeConfigView = languageView;
        else if (state2.configsSubTab === 'ignore')
            activeConfigView = ignoreView;
        else if (state2.configsSubTab === 'scan')
            activeConfigView = scanView;
        const settingsSection = '<div class="section-header" data-action="toggleSection" data-section="settings">' +
            '<span>Settings</span>' +
            '<span class="chevron ' + (collapsed.settings ? 'collapsed' : '') + '">▾</span>' +
            '</div>' +
            '<div class="section-body ' + (collapsed.settings ? 'collapsed' : '') + '">' +
            configTabs + activeConfigView +
            '</div>';
        const alertsPanel = '<div class="panel-alerts ' + (activeTab === 'alerts' ? 'visible' : '') + '">' + filesSection + '</div>';
        const configsPanel = '<div class="panel-configs ' + (activeTab === 'configs' ? 'visible' : '') + '">' + settingsSection + '</div>';
        const promptVariables = (state.promptVariables || [])
            .map(v => '<button class="btn-ghost btn-sm" data-action="insertPromptVariable" data-variable="' + utils.escHtml(v) + '">' + utils.escHtml(v) + '</button>')
            .join('');
        const batchPromptVariables = (state.batchPromptVariables || [])
            .map(v => '<button class="btn-ghost btn-sm" data-action="insertBatchPromptVariable" data-variable="' + utils.escHtml(v) + '">' + utils.escHtml(v) + '</button>')
            .join('');
        const promptsPanel = '<div class="panel-prompts ' + (activeTab === 'prompts' ? 'visible' : '') + '">' +
            '<div class="settings-body">' +
            '<p class="settings-description">Customize copied prompts. Use variables below to insert dynamic values.</p>' +
            '<p class="settings-description"><strong>Single file prompt</strong></p>' +
            '<div class="prompt-vars-row">' + promptVariables + '</div>' +
            '<textarea id="prompt-template" class="prompt-template" rows="12" placeholder="Enter custom prompt template...">' + utils.escHtml(state.promptTemplate || '') + '</textarea>' +
            '<div class="prompt-actions">' +
            '<button class="btn-primary" data-action="savePromptTemplate">Save Prompt</button>' +
            '<button class="btn-secondary" data-action="resetPromptTemplate">Reset to Default</button>' +
            '</div>' +
            '<hr class="settings-divider" />' +
            '<p class="settings-description"><strong>Batch folder prompt</strong></p>' +
            '<div class="prompt-vars-row">' + batchPromptVariables + '</div>' +
            '<textarea id="batch-prompt-template" class="prompt-template" rows="8" placeholder="Enter custom batch prompt template...">' + utils.escHtml(state.batchPromptTemplate || '') + '</textarea>' +
            '<div class="prompt-actions">' +
            '<button class="btn-primary" data-action="saveBatchPromptTemplate">Save Batch Prompt</button>' +
            '<button class="btn-secondary" data-action="resetBatchPromptTemplate">Reset Batch Default</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.getElementById('root').innerHTML = loadingState + '<div class="' + contentClass + '">' + nav + alertsPanel + configsPanel + promptsPanel + '</div>';
    }
};
function renderRoot() {
    const focusSnapshot = takeFocusSnapshot();
    render.root();
    restoreFocusSnapshot(focusSnapshot);
    ensureLoadingMessageTimer();
    ensureLoadingProgressTimer();
}
function decodeFilePath(value) {
    return value ? decodeURIComponent(value) : '';
}
function decodeFilePathList(value) {
    if (!value) {
        return [];
    }
    try {
        const decoded = decodeURIComponent(value);
        const parsed = JSON.parse(decoded);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    }
    catch {
        return [];
    }
}
function onClick(e) {
    const target = e.target;
    const customDropdown = target?.closest('.custom-dropdown');
    const dropdownItem = target?.closest('.dropdown-item');
    if (customDropdown && !dropdownItem) {
        const wasOpen = customDropdown.classList.contains('open');
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!wasOpen) {
            customDropdown.classList.add('open');
        }
        e.stopPropagation();
        return;
    }
    if (dropdownItem && customDropdown) {
        const value = dropdownItem.dataset.value;
        const dropdownId = customDropdown.dataset.id;
        if (value && dropdownId) {
            if (dropdownId === 'alerts-sort') {
                actions.updateAlertsSort(value);
            }
            else if (dropdownId === 'configs-section') {
                actions.updateConfigsSection(value);
            }
            else if (dropdownId === 'limit-display-mode') {
                actions.updateLimitDisplayMode(value);
            }
        }
        e.stopPropagation();
        return;
    }
    document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
    const actionEl = target?.closest('[data-action]');
    if (!actionEl) {
        return;
    }
    const action = actionEl.dataset.action;
    if (!action) {
        return;
    }
    if (actionEl.classList.contains('alert-summary') && action !== 'openFile' && action !== 'toggleFileCard') {
        return;
    }
    switch (action) {
        case 'openFile':
            actions.setActiveFileCard(decodeFilePath(actionEl.dataset.file));
            actions.openFile(decodeFilePath(actionEl.dataset.file));
            break;
        case 'toggleFileCard':
            actions.toggleFileCard(decodeFilePath(actionEl.dataset.file));
            break;
        case 'copyPrompt': {
            const filePath = decodeFilePath(actionEl.dataset.file);
            const file = state.files.find(f => f.filePath === filePath);
            if (file) {
                actions.copyPrompt(filePath, file);
            }
            const originalText = actionEl.textContent;
            actionEl.textContent = 'Copied!';
            actionEl.classList.add('copied');
            setTimeout(() => {
                if (document.body.contains(actionEl)) {
                    actionEl.textContent = originalText;
                    actionEl.classList.remove('copied');
                }
            }, 2000);
            break;
        }
        case 'ignoreForLines':
            actions.ignoreForLines(decodeFilePath(actionEl.dataset.file), Number(actionEl.dataset.linecount || 0));
            break;
        case 'ignoreForever':
            actions.ignoreForever(decodeFilePath(actionEl.dataset.file));
            break;
        case 'copyFolderPrompt':
            actions.copyFolderPrompt(decodeFilePath(actionEl.dataset.folder), decodeFilePathList(actionEl.dataset.files));
            break;
        case 'ignoreFolder':
            actions.ignoreFolder(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'toggleFolderExpand':
            actions.toggleFolderExpand(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'toggleFolderPrompt':
            actions.toggleFolderPrompt(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'removeLineBonus':
            actions.removeLineBonus(decodeFilePath(actionEl.dataset.file));
            break;
        case 'cancelPermanentIgnore':
            actions.cancelPermanentIgnore(decodeFilePath(actionEl.dataset.file));
            break;
        case 'removeCustom':
            if (actionEl.dataset.language) {
                removePredictedCustomConfig(actionEl.dataset.language);
                renderRoot();
                actions.removeCustom(actionEl.dataset.language);
            }
            break;
        case 'addCustom':
            actions.addCustom();
            break;
        case 'switchTab':
            if (actionEl.dataset.tab === 'alerts' || actionEl.dataset.tab === 'configs' || actionEl.dataset.tab === 'prompts') {
                actions.switchTab(actionEl.dataset.tab);
            }
            break;
        case 'toggleSection':
            if (actionEl.dataset.section === 'files' || actionEl.dataset.section === 'settings') {
                actions.toggleSection(actionEl.dataset.section);
            }
            break;
        case 'switchConfigTab':
            if (actionEl.dataset.tab === 'language' || actionEl.dataset.tab === 'ignore' || actionEl.dataset.tab === 'scan') {
                actions.switchConfigTab(actionEl.dataset.tab);
            }
            break;
        case 'addFolder':
            actions.addIgnoredFolder();
            break;
        case 'removeFolder':
            if (actionEl.dataset.folder) {
                actions.removeIgnoredFolder(actionEl.dataset.folder);
            }
            break;
        case 'toggleGitIgnore': {
            const checkbox = actionEl;
            actions.updateIgnoreGitIgnore(Boolean(checkbox.checked));
            break;
        }
        case 'toggleHideFolders': {
            const checkbox = actionEl;
            actions.updateHideFolders(Boolean(checkbox.checked));
            break;
        }
        case 'toggleHideFoldersWhileSearching': {
            const checkbox = actionEl;
            actions.updateHideFoldersWhileSearching(Boolean(checkbox.checked));
            break;
        }
        case 'toggleExpandFoldersOnToggle': {
            const checkbox = actionEl;
            actions.updateExpandFoldersOnToggle(Boolean(checkbox.checked));
            break;
        }
        case 'toggleShowLineCount': {
            const checkbox = actionEl;
            actions.updateShowLineCount(Boolean(checkbox.checked));
            break;
        }
        case 'savePromptTemplate':
            actions.savePromptTemplate();
            break;
        case 'resetPromptTemplate':
            actions.resetPromptTemplate();
            break;
        case 'saveBatchPromptTemplate':
            actions.saveBatchPromptTemplate();
            break;
        case 'resetBatchPromptTemplate':
            actions.resetBatchPromptTemplate();
            break;
        case 'insertPromptVariable':
            if (actionEl.dataset.variable) {
                actions.insertPromptVariable(actionEl.dataset.variable);
            }
            break;
        case 'insertBatchPromptVariable':
            if (actionEl.dataset.variable) {
                actions.insertBatchPromptVariable(actionEl.dataset.variable);
            }
            break;
        case 'togglePuzzle':
            toggleLoadingPuzzle(Number(actionEl.dataset.index));
            break;
    }
}
function onChange(e) {
    const target = e.target;
    if (!target) {
        return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'alerts-sort') {
        actions.updateAlertsSort(target.value);
        return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'configs-section') {
        actions.updateConfigsSection(target.value);
        return;
    }
    if (target instanceof HTMLInputElement && target.id === 'max-files-to-scan') {
        actions.updateMaxFilesToScan(target.value);
        return;
    }
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'updateThreshold' || !target.dataset.language) {
        return;
    }
    actions.updateThreshold(target.dataset.language, target.value);
}
function onInput(e) {
    const target = e.target;
    if (!target) {
        return;
    }
    if (target.id === 'ignored-search') {
        actions.updateIgnoredSearch(target.value);
    }
    else if (target.id === 'configs-search') {
        actions.updateConfigsSearch(target.value);
    }
    else if (target.id === 'alerts-search') {
        actions.updateAlertsSearch(target.value);
    }
}
function onKeyDown(e) {
    const target = e.target;
    if (e.key === 'Enter' && (target?.id === 'new-ext' || target?.id === 'new-lines')) {
        actions.addCustom();
    }
    if (e.key === 'Enter' && target?.id === 'new-folder') {
        actions.addIgnoredFolder();
    }
}
function onDocumentClick(e) {
    const target = e.target;
    if (!target?.closest('.custom-dropdown')) {
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
    }
}
window.addEventListener('beforeunload', () => {
    if (loadingMessageTimer !== undefined) {
        window.clearInterval(loadingMessageTimer);
        loadingMessageTimer = undefined;
    }
    if (loadingProgressTimer !== undefined) {
        window.clearInterval(loadingProgressTimer);
        loadingProgressTimer = undefined;
    }
});
window.addEventListener('message', (e) => {
    if (e.data.type === 'updateState') {
        state = e.data.state;
        if (!state.isLoading) {
            state.loadingProgress = 100;
        }
        renderRoot();
    }
});
const root = document.getElementById('root');
if (root) {
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeyDown);
}
document.addEventListener('click', onDocumentClick, true);
renderRoot();
