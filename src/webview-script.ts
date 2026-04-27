declare const acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };

(function() {
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

  interface TrackedFile {
    filePath: string;
    fileName: string;
    lineCount: number;
    threshold: number;
    overage: number;
  }

  interface LanguageConfig {
    languageId: string;
    displayName: string;
    extension: string;
    lines: number;
    isCustom?: boolean;
  }

  interface WebviewState {
    files: TrackedFile[];
    ignoredFiles: IgnoredFile[];
    configs: LanguageConfig[];
    scanSettings: ScanSettings;
    isLoading: boolean;
    promptTemplate: string;
    promptVariables: string[];
    batchPromptTemplate: string;
    batchPromptVariables: string[];
    defaultBatchPromptTemplate: string;
    defaultPromptTemplate: string;
  }

  interface IgnoredFile {
    filePath: string;
    fileName: string;
    kind: 'lines' | 'forever';
    untilLines?: number;
    bonusLines?: number;
    // Add cached fields for instant restore
    cachedLineCount?: number;
    cachedThreshold?: number;
    cachedOverage?: number;
  }

  interface ScanSettings {
    ignoreGitIgnore: boolean;
    maxFilesToScan: number | null;
    ignoredFolders: string[];
  }

  interface Msg {
    type: string;
    [key: string]: unknown;
  }

  let state: WebviewState = {
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
    batchPromptTemplate: '',
    batchPromptVariables: [],
    defaultBatchPromptTemplate: '',
    defaultPromptTemplate: '',
  };

  const state2 = {
    collapsed: { files: false, settings: false },
    activeTab: 'alerts' as 'alerts' | 'configs' | 'prompts',
    configsSubTab: 'language' as 'language' | 'ignore' | 'scan',
    alertsSearch: '',
    alertsSort: 'overageDesc' as 'overageDesc' | 'overageAsc',
    ignoredSearch: '',
    configsSearch: ''
  };

  interface FocusSnapshot {
    id: string;
    selectionStart: number | null;
    selectionEnd: number | null;
  }

  let loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
  let loadingMessageTimer: number | undefined;
  let loadingPuzzle = createLoadingPuzzle();

  const emit = (msg: Msg) => vscode.postMessage(msg);

  function upsertPredictedCustomConfig(extension: string, lines: number) {
    const ext = extension.startsWith('.') ? extension.slice(1) : extension;
    const extWithDot = '.' + ext;
    const languageId = 'custom:' + extWithDot;
    const existing = state.configs.find(cfg => cfg.languageId === languageId);

    if (existing) {
      existing.lines = lines;
      existing.isCustom = true;
      existing.extension = extWithDot;
      existing.displayName = ext.toUpperCase();
    } else {
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

  function removePredictedCustomConfig(languageId: string) {
    state.configs = state.configs.filter(cfg => !(cfg.languageId === languageId && cfg.isCustom));
  }

  const actions = {
    openFile: (filePath: string) => emit({ type: 'openFile', filePath }),
    ignoreForLines: (filePath: string, lineCount: number) => {
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
    ignoreForever: (filePath: string) => {
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
    removeLineBonus: (filePath: string) => {
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
    cancelPermanentIgnore: (filePath: string) => {
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
    copyPrompt: (filePath: string, fileData: TrackedFile) => emit({ type: 'copyPrompt', filePath, fileData }),
    copyFolderPrompt: (folderName: string, filePaths: string[]) => emit({ type: 'copyBatchPrompt', folderName, filePaths }),
    updateThreshold: (languageId: string, value: string) => {
      const lines = parseInt(value, 10);
      if (!isNaN(lines) && lines > 0) emit({ type: 'updateThreshold', languageId, lines });
    },
    removeCustom: (languageId: string) => emit({ type: 'removeCustom', languageId }),
    addCustom: () => {
      const extInput = document.getElementById('new-ext') as HTMLInputElement;
      const linesInput = document.getElementById('new-lines') as HTMLInputElement;
      const errEl = document.getElementById('add-error') as HTMLElement;
      if (!extInput || !linesInput) return;
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
    switchTab: (tab: 'alerts' | 'configs' | 'prompts') => { state2.activeTab = tab; renderRoot(); },
    switchConfigTab: (tab: 'language' | 'ignore' | 'scan') => { state2.configsSubTab = tab; renderRoot(); },
    updateConfigsSection: (value: string) => {
      state2.configsSubTab = value === 'ignore' || value === 'scan' ? value : 'language';
      renderRoot();
    },
    toggleSection: (name: 'files' | 'settings') => { state2.collapsed[name] = !state2.collapsed[name]; renderRoot(); },
    updateIgnoredSearch: (value: string) => { state2.ignoredSearch = value; renderRoot(); },
    updateAlertsSearch: (value: string) => { state2.alertsSearch = value; renderRoot(); },
    updateAlertsSort: (value: string) => {
      state2.alertsSort = value === 'overageAsc' ? 'overageAsc' : 'overageDesc';
      renderRoot();
    },
    updateConfigsSearch: (value: string) => { state2.configsSearch = value; renderRoot(); },
    updateIgnoreGitIgnore: (enabled: boolean) => {
      state.scanSettings.ignoreGitIgnore = enabled;
      renderRoot();
      emit({ type: 'updateIgnoreGitIgnore', enabled });
    },
    updateMaxFilesToScan: (value: string) => {
      const parsed = parseInt(value, 10);
      const maxFilesToScan = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      state.scanSettings.maxFilesToScan = maxFilesToScan;
      renderRoot();
      emit({ type: 'updateMaxFilesToScan', maxFilesToScan });
    },
    addIgnoredFolder: () => {
      const folderInput = document.getElementById('new-folder') as HTMLInputElement | null;
      const errEl = document.getElementById('folder-error') as HTMLElement | null;
      if (!folderInput || !errEl) { return; }
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
    removeIgnoredFolder: (folder: string) => {
      state.scanSettings.ignoredFolders = state.scanSettings.ignoredFolders.filter(item => item !== folder);
      renderRoot();
      emit({ type: 'removeIgnoredFolder', folder });
    },
    savePromptTemplate: () => {
      const textarea = document.getElementById('prompt-template') as HTMLTextAreaElement | null;
      if (!textarea) { return; }
      emit({ type: 'savePromptTemplate', template: textarea.value });
    },
    saveBatchPromptTemplate: () => {
      const textarea = document.getElementById('batch-prompt-template') as HTMLTextAreaElement | null;
      if (!textarea) { return; }
      emit({ type: 'saveBatchPromptTemplate', template: textarea.value });
    },
    resetPromptTemplate: () => emit({ type: 'resetPromptTemplate' as const }),
    resetBatchPromptTemplate: () => emit({ type: 'resetBatchPromptTemplate' as const }),
    insertPromptVariable: (variable: string) => {
      const textarea = document.getElementById('prompt-template') as HTMLTextAreaElement | null;
      if (!textarea) { return; }
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + variable + textarea.value.slice(end);
      textarea.focus();
      const cursor = start + variable.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    },
    insertBatchPromptVariable: (variable: string) => {
      const textarea = document.getElementById('batch-prompt-template') as HTMLTextAreaElement | null;
      if (!textarea) { return; }
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
    escHtml: (str: string) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    getSeverity: (file: TrackedFile) => file.overage > file.threshold * 0.5 ? 'error' : 'warn'
  };

  function pickLoadingMessage(previous: string): string {
    if (LOADING_MESSAGES.length < 2) {
      return LOADING_MESSAGES[0] || 'Loading...';
    }

    let next = previous;
    while (next === previous) {
      next = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    }
    return next;
  }

  function applyPuzzleMove(cells: boolean[], index: number): void {
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

  function createLoadingPuzzle(): boolean[] {
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

  function isPuzzleSolved(): boolean {
    return loadingPuzzle.every(cell => !cell);
  }

  function loadingPuzzleMarkup(): string {
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

  function toggleLoadingPuzzle(index: number): void {
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

  function takeFocusSnapshot(): FocusSnapshot | null {
    const active = document.activeElement as HTMLElement | null;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !active.id) {
      return null;
    }

    return {
      id: active.id,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }

  function restoreFocusSnapshot(snapshot: FocusSnapshot | null): void {
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

  interface FolderNode {
    name: string;
    path: string;
    files: TrackedFile[];
    children: Map<string, FolderNode>;
  }

  function normalizeFolderSegments(filePath: string): string[] {
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.slice(0, Math.max(0, parts.length - 1));
  }

  function buildFolderTree(files: TrackedFile[]): FolderNode {
    const root: FolderNode = { name: '', path: '', files: [], children: new Map() };

    for (const file of files) {
      const segments = normalizeFolderSegments(file.filePath);
      let current = root;
      let runningPath = '';
      for (const segment of segments) {
        runningPath = runningPath ? runningPath + '/' + segment : segment;
        if (!current.children.has(segment)) {
          current.children.set(segment, {
            name: segment,
            path: runningPath,
            files: [],
            children: new Map(),
          });
        }
        current = current.children.get(segment)!;
      }
      current.files.push(file);
    }

    return root;
  }

  function minimizeFolderTree(root: FolderNode): FolderNode {
    let current = root;
    while (current.files.length === 0 && current.children.size === 1) {
      const onlyChild = Array.from(current.children.values())[0];
      current = onlyChild;
    }
    return current;
  }

  const render = {
    fileCard: (file: TrackedFile): string => {
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
    folderNode: (node: FolderNode): string => {
      const childMarkup = Array.from(node.children.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(child => render.folderNode(child))
        .join('');
      const fileMarkup = [...node.files]
        .sort((a, b) => b.overage - a.overage)
        .map(render.fileCard)
        .join('');
      const allPaths = [
        ...node.files.map(file => file.filePath),
        ...Array.from(node.children.values()).flatMap(function collectPaths(child): string[] {
          const nested = Array.from(child.children.values()).flatMap(collectPaths);
          return [...child.files.map(file => file.filePath), ...nested];
        }),
      ];

      return '<details class="folder-node" open>' +
        '<summary class="folder-summary">' +
          '<span class="folder-title">' +
            '<span class="folder-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 16 16" width="14" height="14" focusable="false">' +
                '<path fill="currentColor" d="M1.5 3.5h4.1l1.1 1.5h7.8v7.5a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" opacity="0.85"></path>' +
              '</svg>' +
            '</span>' +
            utils.escHtml(node.name || '.') +
          '</span>' +
          '<span class="folder-actions">' +
            '<button class="btn-secondary btn-sm" data-action="copyFolderPrompt" data-folder="' + utils.escHtml(encodeURIComponent(node.path || '.')) + '" data-files="' + utils.escHtml(encodeURIComponent(JSON.stringify(allPaths))) + '">Copy Prompt</button>' +
          '</span>' +
        '</summary>' +
        '<div class="folder-children">' + childMarkup + fileMarkup + '</div>' +
      '</details>';
    },
    thresholdRow: (cfg: LanguageConfig): string => {
      const { escHtml } = utils;
      const customClass = cfg.isCustom ? ' custom-lang' : '';
      let row = '<tr><td><div class="lang-name' + customClass + '">' + escHtml(cfg.displayName);
      row += '</div><div class="lang-ext">' + escHtml(cfg.extension) + '</div></td>';
      row += '<td><input type="number" value="' + cfg.lines + '" min="10" max="9999" data-action="updateThreshold" data-language="' + escHtml(cfg.languageId) + '" /></td>';
      row += '<td>' + (cfg.isCustom ? '<button class="btn-danger btn-sm" data-action="removeCustom" data-language="' + escHtml(cfg.languageId) + '">X</button>' : '') + '</td></tr>';
      return row;
    },
    ignoredCard: (file: IgnoredFile): string => {
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
        ? ignoredFiles.filter(file =>
            file.fileName.toLowerCase().includes(ignoredSearch) ||
            file.filePath.toLowerCase().includes(ignoredSearch)
          )
        : ignoredFiles;

      const configsSearch = state2.configsSearch.trim().toLowerCase();
      const filteredConfigs = configsSearch
        ? configs.filter(cfg =>
            cfg.displayName.toLowerCase().includes(configsSearch) ||
            cfg.extension.toLowerCase().includes(configsSearch)
          )
        : configs;
      
      const sortedConfigs = [...filteredConfigs].sort((a, b) => {
        if (a.isCustom && !b.isCustom) return -1;
        if (!a.isCustom && b.isCustom) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

      const nav = '<div class="nav-bar">' +
        '<button class="nav-tab ' + (activeTab === 'alerts' ? 'active' : '') + '" data-action="switchTab" data-tab="alerts">Alerts</button>' +
        '<button class="nav-tab ' + (activeTab === 'configs' ? 'active' : '') + '" data-action="switchTab" data-tab="configs">Configs</button>' +
        '<button class="nav-tab ' + (activeTab === 'prompts' ? 'active' : '') + '" data-action="switchTab" data-tab="prompts">Prompts</button>' +
      '</div>';

      const alertsSearch = state2.alertsSearch.trim().toLowerCase();
      const searchedFiles = alertsSearch
        ? files.filter(file =>
            file.fileName.toLowerCase().includes(alertsSearch) ||
            file.filePath.toLowerCase().includes(alertsSearch)
          )
        : files;
      const filteredFiles = [...searchedFiles].sort((a, b) => {
        if (state2.alertsSort === 'overageAsc') {
          return a.overage - b.overage;
        }
        return b.overage - a.overage;
      });
      const folderTree = minimizeFolderTree(buildFolderTree(filteredFiles));
      const folderMarkup = folderTree.name || folderTree.path
        ? render.folderNode(folderTree)
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
          '<select id="alerts-sort" class="alerts-sort">' +
            '<option value="overageDesc"' + (state2.alertsSort === 'overageDesc' ? ' selected' : '') + '>Most over first</option>' +
            '<option value="overageAsc"' + (state2.alertsSort === 'overageAsc' ? ' selected' : '') + '>Least over first</option>' +
          '</select>' +
        '</div>' +
        (filteredFiles.length === 0
          ? '<div class="empty-state">All files are within their line thresholds or no results match your search.</div>'
          : folderMarkup) +
      '</div>';

      const configTabs = '<div class="settings-mode">' +
        '<label class="settings-mode-label" for="configs-section">Settings section</label>' +
        '<select id="configs-section" class="settings-mode-select">' +
          '<option value="language"' + (state2.configsSubTab === 'language' ? ' selected' : '') + '>Language thresholds</option>' +
          '<option value="ignore"' + (state2.configsSubTab === 'ignore' ? ' selected' : '') + '>Ignored files</option>' +
          '<option value="scan"' + (state2.configsSubTab === 'scan' ? ' selected' : '') + '>Scanning</option>' +
        '</select>' +
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
          : '<div>' + state.scanSettings.ignoredFolders.map(folder =>
            '<div class="file-card"><div class="file-meta"><span class="file-name">' + utils.escHtml(folder) + '</span></div>' +
            '<div class="file-actions"><button class="btn-primary btn-sm" data-action="removeFolder" data-folder="' + utils.escHtml(folder) + '">Remove</button></div></div>'
          ).join('') + '</div>') +
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
        '<label class="scan-field-label">Max files to scan (blank = unlimited)</label>' +
        '<input type="number" id="max-files-to-scan" min="1" placeholder="Unlimited" value="' + (state.scanSettings.maxFilesToScan ?? '') + '" class="scan-input" />' +
      '</div>';

      let activeConfigView = '';
      if (state2.configsSubTab === 'language') activeConfigView = languageView;
      else if (state2.configsSubTab === 'ignore') activeConfigView = ignoreView;
      else if (state2.configsSubTab === 'scan') activeConfigView = scanView;

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

      document.getElementById('root')!.innerHTML = loadingState + '<div class="' + contentClass + '">' + nav + alertsPanel + configsPanel + promptsPanel + '</div>';
    }
  };

  function renderRoot() {
    const focusSnapshot = takeFocusSnapshot();
    render.root();
    restoreFocusSnapshot(focusSnapshot);
    ensureLoadingMessageTimer();
  }

  function decodeFilePath(value: string | undefined): string {
    return value ? decodeURIComponent(value) : '';
  }

  function decodeFilePathList(value: string | undefined): string[] {
    if (!value) { return []; }
    try {
      const decoded = decodeURIComponent(value);
      const parsed = JSON.parse(decoded);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    const actionEl = target?.closest('[data-action]') as HTMLElement | null;
    if (!actionEl) { return; }

    const action = actionEl.dataset.action;
    if (!action) { return; }

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
        actions.ignoreForLines(
          decodeFilePath(actionEl.dataset.file),
          Number(actionEl.dataset.linecount || 0)
        );
        break;
      case 'ignoreForever':
        actions.ignoreForever(decodeFilePath(actionEl.dataset.file));
        break;
      case 'copyFolderPrompt':
        actions.copyFolderPrompt(
          decodeFilePath(actionEl.dataset.folder),
          decodeFilePathList(actionEl.dataset.files)
        );
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
        const checkbox = actionEl as HTMLInputElement;
        actions.updateIgnoreGitIgnore(Boolean(checkbox.checked));
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

  function onChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLSelectElement | null;
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
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'updateThreshold' || !target.dataset.language) {
      return;
    }
  }

  function onInput(e: Event) {
    const target = e.target as HTMLInputElement | null;
    if (!target) { return; }
    if (target.id === 'ignored-search') {
      actions.updateIgnoredSearch(target.value);
    } else if (target.id === 'configs-search') {
      actions.updateConfigsSearch(target.value);
    } else if (target.id === 'alerts-search') {
      actions.updateAlertsSearch(target.value);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
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

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.data.type === 'updateState') {
      state = e.data.state as WebviewState;
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
