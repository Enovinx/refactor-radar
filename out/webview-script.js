"use strict";
(function () {
    'use strict';
    const vscode = acquireVsCodeApi();
    const LOADING_MESSAGES = [
        'Sending the scanning bots out...',
        'Sweeping for code bloat...',
        'Polishing refactor radar lenses...',
        'Negotiating with suspiciously long files...',
        'Plotting a cleaner code trajectory...',
        'Triangulating hotspots in your codebase...',
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
        },
        isLoading: true,
        promptTemplate: '',
        promptVariables: [],
        defaultPromptTemplate: '',
    };
    const state2 = {
        collapsed: { files: false, settings: false },
        activeTab: 'alerts',
        configsSubTab: 'home',
        alertsSearch: '',
        ignoredSearch: '',
        configsSearch: ''
    };
    let loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    let loadingMessageTimer;
    let loadingPuzzle = createLoadingPuzzle();
    const emit = (msg) => vscode.postMessage(msg);
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
    const actions = {
        openFile: (filePath) => emit({ type: 'openFile', filePath }),
        ignoreForLines: (filePath, lineCount) => {
            const file = state.files.find(f => f.filePath === filePath);
            if (file) {
                state.files = state.files.filter(f => f.filePath !== filePath);
                state.ignoredFiles = [...state.ignoredFiles, {
                        filePath,
                        fileName: file.fileName,
                        kind: 'lines',
                        untilLines: lineCount + 200,
                        bonusLines: 200,
                        cachedLineCount: file.lineCount,
                        cachedThreshold: file.threshold,
                        cachedOverage: file.overage
                    }];
                renderRoot();
            }
            emit({ type: 'ignoreForLines', filePath, lineCount, extra: 200 });
        },
        ignoreForever: (filePath) => {
            const file = state.files.find(f => f.filePath === filePath);
            if (file) {
                state.files = state.files.filter(f => f.filePath !== filePath);
                state.ignoredFiles = [...state.ignoredFiles, {
                        filePath,
                        fileName: file.fileName,
                        kind: 'forever',
                        cachedLineCount: file.lineCount,
                        cachedThreshold: file.threshold,
                        cachedOverage: file.overage
                    }];
                renderRoot();
            }
            emit({ type: 'ignoreForever', filePath });
        },
        removeLineBonus: (filePath) => {
            const ignoredFile = state.ignoredFiles.find(f => f.filePath === filePath);
            if (ignoredFile && ignoredFile.cachedLineCount !== undefined && ignoredFile.cachedThreshold !== undefined) {
                state.files = [...state.files, {
                        filePath: ignoredFile.filePath,
                        fileName: ignoredFile.fileName,
                        lineCount: ignoredFile.cachedLineCount,
                        threshold: ignoredFile.cachedThreshold,
                        overage: ignoredFile.cachedOverage || 0
                    }];
            }
            state.ignoredFiles = state.ignoredFiles.filter(f => f.filePath !== filePath);
            renderRoot();
            emit({ type: 'removeLineBonus', filePath });
        },
        cancelPermanentIgnore: (filePath) => {
            const ignoredFile = state.ignoredFiles.find(f => f.filePath === filePath);
            if (ignoredFile && ignoredFile.cachedLineCount !== undefined && ignoredFile.cachedThreshold !== undefined) {
                state.files = [...state.files, {
                        filePath: ignoredFile.filePath,
                        fileName: ignoredFile.fileName,
                        lineCount: ignoredFile.cachedLineCount,
                        threshold: ignoredFile.cachedThreshold,
                        overage: ignoredFile.cachedOverage || 0
                    }];
            }
            state.ignoredFiles = state.ignoredFiles.filter(f => f.filePath !== filePath);
            renderRoot();
            emit({ type: 'cancelPermanentIgnore', filePath });
        },
        copyPrompt: (filePath, fileData) => emit({ type: 'copyPrompt', filePath, fileData }),
        updateThreshold: (languageId, value) => {
            const lines = parseInt(value, 10);
            if (!isNaN(lines) && lines > 0)
                emit({ type: 'updateThreshold', languageId, lines });
        },
        removeCustom: (languageId) => emit({ type: 'removeCustom', languageId }),
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
        toggleSection: (name) => { state2.collapsed[name] = !state2.collapsed[name]; renderRoot(); },
        updateIgnoredSearch: (value) => { state2.ignoredSearch = value; renderRoot(); },
        updateAlertsSearch: (value) => { state2.alertsSearch = value; renderRoot(); },
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
        addIgnoredFolder: () => {
            const folderInput = document.getElementById('new-folder');
            const errEl = document.getElementById('folder-error');
            if (!folderInput || !errEl) {
                return;
            }
            const folder = folderInput.value.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
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
        resetPromptTemplate: () => emit({ type: 'resetPromptTemplate' }),
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
    const render = {
        fileCard: (file) => {
            const { escHtml } = utils;
            const encodedPath = encodeURIComponent(file.filePath);
            return '<div class="file-card">' +
                '<div class="file-meta">' +
                '<span class="file-name" title="' + escHtml(file.filePath) + '" data-action="openFile" data-file="' + escHtml(encodedPath) + '">' + escHtml(file.fileName) + '</span>' +
                '</div>' +
                '<div class="file-stats">' +
                '<span>' + file.lineCount + ' lines</span>' +
                '<span>limit: ' + file.threshold + '</span>' +
                '<span class="overage">+' + file.overage + ' over</span>' +
                '</div>' +
                '<div class="file-actions">' +
                '<button class="btn-primary" data-action="copyPrompt" data-file="' + escHtml(encodedPath) + '">Copy AI Prompt</button>' +
                '<span class="ignore-label">Ignore:</span>' +
                '<button class="btn-ghost btn-md" data-action="ignoreForLines" data-file="' + escHtml(encodedPath) + '" data-linecount="' + file.lineCount + '">+ 200</button>' +
                '<button class="btn-ghost btn-md" data-action="ignoreForever" data-file="' + escHtml(encodedPath) + '">all</button>' +
                '</div>' +
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
            const details = isForever
                ? 'This file is hidden from alerts until you cancel permanent ignore.'
                : '+' + (file.bonusLines ?? 0) + ' lines applied (max ' + (file.untilLines ?? 0) + ' lines)';
            const action = isForever
                ? '<button class="btn-danger btn-sm" data-action="cancelPermanentIgnore" data-file="' + escHtml(encodedPath) + '">Cancel permanent ignore</button>'
                : '<button class="btn-secondary btn-sm" data-action="removeLineBonus" data-file="' + escHtml(encodedPath) + '">Remove line bonus</button>';
            return '<div class="file-card">' +
                '<div class="file-meta">' +
                '<span class="file-name" title="' + escHtml(file.filePath) + '" data-action="openFile" data-file="' + escHtml(encodedPath) + '">' + escHtml(file.fileName) + '</span>' +
                '</div>' +
                '<div class="ignored-details">' + escHtml(details) + '</div>' +
                '<div class="file-actions">' +
                '<button class="btn-ghost btn-sm" data-action="openFile" data-file="' + escHtml(encodedPath) + '">Open File</button>' +
                action +
                '</div>' +
                '</div>';
        },
        root: () => {
            const loadingState = '<div class="loading-state ' + (state.isLoading ? 'visible' : '') + '">' +
                '<div class="loading-title">Loading extension state...</div>' +
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
            const filteredFiles = alertsSearch
                ? files.filter(file => file.fileName.toLowerCase().includes(alertsSearch) ||
                    file.filePath.toLowerCase().includes(alertsSearch))
                : files;
            const filesSection = '<div class="section-header" data-action="toggleSection" data-section="files">' +
                '<span>Files Over Threshold</span>' +
                (files.length > 0 ? '<span class="badge">' + files.length + '</span>' : '') +
                '<span class="chevron ' + (collapsed.files ? 'collapsed' : '') + '">▾</span>' +
                '</div>' +
                '<div class="section-body ' + (collapsed.files ? 'collapsed' : '') + '">' +
                '<div class="alerts-toolbar">' +
                '<input type="text" id="alerts-search" class="alerts-search" placeholder="Search alerts..." value="' + utils.escHtml(state2.alertsSearch) + '" />' +
                '</div>' +
                (filteredFiles.length === 0
                    ? '<div class="empty-state">All files are within their line thresholds or no results match your search.</div>'
                    : filteredFiles.map(render.fileCard).join('')) +
                '</div>';
            const configTabs = '<div class="nav-bar" style="border-bottom:none; margin-bottom: 10px;">' +
                '<button class="nav-tab ' + (state2.configsSubTab === 'home' ? 'active' : '') + '" data-action="switchConfigTab" data-tab="home">Categories</button>' +
                '<button class="nav-tab ' + (state2.configsSubTab === 'language' || state2.configsSubTab === 'customLanguage' ? 'active' : '') + '" data-action="switchConfigTab" data-tab="language">Language</button>' +
                '<button class="nav-tab ' + (state2.configsSubTab === 'ignore' || state2.configsSubTab === 'manageFolders' ? 'active' : '') + '" data-action="switchConfigTab" data-tab="ignore">Ignore</button>' +
                '<button class="nav-tab ' + (state2.configsSubTab === 'scan' ? 'active' : '') + '" data-action="switchConfigTab" data-tab="scan">Scanning</button>' +
                '</div>';
            const settingsHomeView = '<div class="settings-body">' +
                '<p class="settings-description">Open one settings category at a time.</p>' +
                '<div class="file-actions">' +
                '<button class="btn-secondary" style="width:100%" data-action="switchConfigTab" data-tab="language">Language thresholds</button>' +
                '<button class="btn-secondary" style="width:100%" data-action="switchConfigTab" data-tab="ignore">Ignored files</button>' +
                '<button class="btn-secondary" style="width:100%" data-action="switchConfigTab" data-tab="scan">Scan behavior</button>' +
                '</div>' +
                '</div>';
            const customLangForm = '<div class="settings-body">' +
                '<button class="btn-ghost btn-sm" style="margin-bottom: 12px;" data-action="switchConfigTab" data-tab="language">← Back</button>' +
                '<div class="add-custom-row" style="margin-bottom: 12px;">' +
                '<input type="text" id="new-ext" placeholder=".ext" maxlength="12" />' +
                '<input type="number" id="new-lines" placeholder="lines" min="10" max="9999" />' +
                '<button class="btn-primary" data-action="addCustom">Add custom</button>' +
                '</div>' +
                '<p id="add-error" class="error-msg"></p>' +
                '</div>';
            const languageView = '<div class="settings-body">' +
                '<p class="settings-description">Set the maximum line count per file type.</p>' +
                '<div class="configs-toolbar">' +
                '<input type="text" id="configs-search" class="configs-search" placeholder="Search languages..." value="' + utils.escHtml(state2.configsSearch) + '" />' +
                '</div>' +
                '<button class="btn-secondary" style="margin-bottom: 12px; width: 100%" data-action="switchConfigTab" data-tab="customLanguage">Add custom language</button>' +
                '<table class="threshold-table"><thead><tr><th>Language</th><th>Max lines</th><th></th></tr></thead><tbody>' +
                sortedConfigs.map(render.thresholdRow).join('') +
                '</tbody></table>' +
                '</div>';
            const ignoreView = '<div class="settings-body">' +
                '<div class="ignored-toolbar" style="padding-left:0; padding-right:0;">' +
                '<input type="text" id="ignored-search" class="ignored-search" placeholder="Search ignored files..." value="' + utils.escHtml(state2.ignoredSearch) + '" />' +
                '</div>' +
                '<button class="btn-secondary" style="margin: 8px 0; width: 100%" data-action="switchConfigTab" data-tab="manageFolders">Manage ignored folders</button>' +
                '<div class="ignored-note" style="padding-left:0; padding-right:0;">Manage ignored files and line bonuses from one place.</div>' +
                (filteredIgnoredFiles.length === 0
                    ? '<div class="empty-state">' + (ignoredFiles.length === 0 ? 'No ignored files yet.' : 'No ignored files match your search.') + '</div>'
                    : filteredIgnoredFiles.map(render.ignoredCard).join('')) +
                '</div>';
            const manageFoldersView = '<div class="settings-body">' +
                '<button class="btn-ghost btn-sm" style="margin-bottom: 12px;" data-action="switchConfigTab" data-tab="ignore">← Back</button>' +
                '<p class="settings-description">Add folders to ignore from workspace root.</p>' +
                '<div class="add-custom-row" style="margin-bottom: 12px;">' +
                '<input type="text" id="new-folder" placeholder="folder/path" style="flex:1" />' +
                '<button class="btn-primary" data-action="addFolder">Add Folder</button>' +
                '</div>' +
                '<p id="folder-error" class="error-msg"></p>' +
                (state.scanSettings.ignoredFolders.length === 0
                    ? '<div class="empty-state">No ignored folders yet.</div>'
                    : '<div>' + state.scanSettings.ignoredFolders.map(folder => '<div class="file-card"><div class="file-meta"><span class="file-name">' + utils.escHtml(folder) + '</span></div>' +
                        '<div class="file-actions"><button class="btn-danger btn-sm" data-action="removeFolder" data-folder="' + utils.escHtml(folder) + '">Remove</button></div></div>').join('') + '</div>') +
                '</div>';
            const scanView = '<div class="settings-body">' +
                '<p class="settings-description">Control how scanning works for large repositories.</p>' +
                '<label style="display:flex; align-items:center; gap:6px; margin-bottom: 12px;">' +
                '<input type="checkbox" id="toggle-gitignore" data-action="toggleGitIgnore" ' + (state.scanSettings.ignoreGitIgnore ? 'checked' : '') + ' />' +
                'Ignore files listed in .gitignore' +
                '</label>' +
                '<label style="display:block; margin-bottom: 6px;">Max files to scan (blank = unlimited)</label>' +
                '<input type="number" id="max-files-to-scan" min="1" placeholder="Unlimited" value="' + (state.scanSettings.maxFilesToScan ?? '') + '" style="width: 100%;" />' +
                '<button class="btn-secondary" style="margin-top: 10px; width:100%" data-action="switchConfigTab" data-tab="manageFolders">Manage ignored folders</button>' +
                '</div>';
            let activeConfigView = '';
            if (state2.configsSubTab === 'home')
                activeConfigView = settingsHomeView;
            else if (state2.configsSubTab === 'language')
                activeConfigView = languageView;
            else if (state2.configsSubTab === 'customLanguage')
                activeConfigView = customLangForm;
            else if (state2.configsSubTab === 'ignore')
                activeConfigView = ignoreView;
            else if (state2.configsSubTab === 'scan')
                activeConfigView = scanView;
            else if (state2.configsSubTab === 'manageFolders')
                activeConfigView = manageFoldersView;
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
            const promptsPanel = '<div class="panel-prompts ' + (activeTab === 'prompts' ? 'visible' : '') + '">' +
                '<div class="settings-body">' +
                '<p class="settings-description">Customize the copied AI prompt. Use variables below to insert dynamic values.</p>' +
                '<div class="prompt-vars-row">' + promptVariables + '</div>' +
                '<textarea id="prompt-template" class="prompt-template" rows="12" placeholder="Enter custom prompt template...">' + utils.escHtml(state.promptTemplate || '') + '</textarea>' +
                '<div class="prompt-actions">' +
                '<button class="btn-primary" data-action="savePromptTemplate">Save Prompt</button>' +
                '<button class="btn-secondary" data-action="resetPromptTemplate">Reset to Default</button>' +
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
    }
    function decodeFilePath(value) {
        return value ? decodeURIComponent(value) : '';
    }
    function onClick(e) {
        const target = e.target;
        const actionEl = target?.closest('[data-action]');
        if (!actionEl) {
            return;
        }
        const action = actionEl.dataset.action;
        if (!action) {
            return;
        }
        switch (action) {
            case 'openFile':
                actions.openFile(decodeFilePath(actionEl.dataset.file));
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
                if (actionEl.dataset.tab === 'home' || actionEl.dataset.tab === 'language' || actionEl.dataset.tab === 'ignore' || actionEl.dataset.tab === 'customLanguage' || actionEl.dataset.tab === 'scan' || actionEl.dataset.tab === 'manageFolders') {
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
            case 'savePromptTemplate':
                actions.savePromptTemplate();
                break;
            case 'resetPromptTemplate':
                actions.resetPromptTemplate();
                break;
            case 'insertPromptVariable':
                if (actionEl.dataset.variable) {
                    actions.insertPromptVariable(actionEl.dataset.variable);
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
        if (target.dataset.action === 'updateThreshold' && target.dataset.language) {
            actions.updateThreshold(target.dataset.language, target.value);
            return;
        }
        if (target.id === 'max-files-to-scan') {
            actions.updateMaxFilesToScan(target.value);
            return;
        }
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
    window.addEventListener('beforeunload', () => {
        if (loadingMessageTimer !== undefined) {
            window.clearInterval(loadingMessageTimer);
            loadingMessageTimer = undefined;
        }
    });
    window.addEventListener('message', (e) => {
        if (e.data.type === 'updateState') {
            state = e.data.state;
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
    renderRoot();
})();
