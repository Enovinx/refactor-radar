declare const acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };

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
  workspaceRoot: string | null;
  isLoading: boolean;
  loadingProgress: number;
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
  hideFolders: boolean;
  hideFoldersWhileSearching: boolean;
  expandFoldersOnToggle: boolean;
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
    hideFolders: false,
    hideFoldersWhileSearching: true,
    expandFoldersOnToggle: true,
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

const initialState = (window as unknown as { __STATE__?: WebviewState }).__STATE__;
if (initialState) {
  state = initialState;
}

const state2 = {
  collapsed: { files: false, settings: false },
  activeTab: 'alerts' as 'alerts' | 'configs' | 'prompts',
  configsSubTab: 'language' as 'language' | 'ignore' | 'scan',
  alertsSearch: '',
  alertsSort: 'overageDesc' as 'overageDesc' | 'overageAsc',
  ignoredSearch: '',
  configsSearch: '',
  expandedFolders: new Set<string>(),
  activeFolderPrompt: null as string | null,
  activeFileCard: null as string | null,
};

interface FocusSnapshot {
  id: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

let loadingMessage = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
let loadingMessageTimer: number | undefined;
let loadingProgressTimer: number | undefined;
let loadingPuzzle = createLoadingPuzzle();

const emit = (msg: Msg) => vscode.postMessage(msg);

function normalizeRelativePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function normalizeAbsolutePath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return /^[a-zA-Z]:/.test(normalized) ? normalized.toLowerCase() : normalized;
}

function getWorkspaceRelativePath(filePath: string): string {
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

function restoreIgnoredFileToAlerts(filePath: string) {
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
}

function optimisticIgnoreFile(filePath: string, kind: IgnoredFile['kind'], untilLines?: number, bonusLines?: number) {
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

function removePredictedIgnoredFolder(folderPath: string) {
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

function expandFoldersForFile(filePath: string) {
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

function expandFolderTree(folderPath: string) {
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
  openFile: (filePath: string) => emit({ type: 'openFile', filePath }),
  ignoreForLines: (filePath: string, lineCount: number) => {
    optimisticIgnoreFile(filePath, 'lines', lineCount + 200, 200);
    emit({ type: 'ignoreForLines', filePath, lineCount, extra: 200 });
  },
  ignoreForever: (filePath: string) => {
    optimisticIgnoreFile(filePath, 'forever');
    emit({ type: 'ignoreForever', filePath });
  },
  removeLineBonus: (filePath: string) => {
    restoreIgnoredFileToAlerts(filePath);
    state.ignoredFiles = state.ignoredFiles.filter(f => f.filePath !== filePath);
    renderRoot();
    emit({ type: 'removeLineBonus', filePath });
  },
  cancelPermanentIgnore: (filePath: string) => {
    restoreIgnoredFileToAlerts(filePath);
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
  setActiveFileCard: (filePath: string | null) => {
    state2.activeFileCard = filePath;
    renderRoot();
  },
  toggleFileCard: (filePath: string) => {
    if (!filePath) { return; }
    state2.activeFileCard = state2.activeFileCard === filePath ? null : filePath;
    if (state2.activeFileCard && state2.alertsSearch.trim() && !state.scanSettings.hideFolders && state.scanSettings.hideFoldersWhileSearching) {
      expandFoldersForFile(state2.activeFileCard);
    }
    renderRoot();
  },
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
  updateAlertsSearch: (value: string) => {
    const previous = state2.alertsSearch.trim();
    state2.alertsSearch = value;
    const next = state2.alertsSearch.trim();
    if (previous && !next && state2.activeFileCard && !state.scanSettings.hideFolders && state.scanSettings.hideFoldersWhileSearching) {
      expandFoldersForFile(state2.activeFileCard);
    }
    renderRoot();
  },
  updateAlertsSort: (value: string) => {
    state2.alertsSort = value === 'overageAsc' ? 'overageAsc' : 'overageDesc';
    renderRoot();
  },
  toggleFolderExpand: (folderPath: string) => {
    if (!folderPath) {
      return;
    }
    if (state2.expandedFolders.has(folderPath)) {
      state2.expandedFolders.delete(folderPath);
    } else {
      if (state.scanSettings.expandFoldersOnToggle) {
        expandFolderTree(folderPath);
      } else {
        state2.expandedFolders.add(folderPath);
      }
    }
    renderRoot();
  },
  toggleFolderPrompt: (folderPath: string) => {
    if (!folderPath) {
      return;
    }
    state2.activeFolderPrompt = state2.activeFolderPrompt === folderPath ? null : folderPath;
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
  updateHideFolders: (enabled: boolean) => {
    state.scanSettings.hideFolders = enabled;
    renderRoot();
    emit({ type: 'updateHideFolders', enabled });
  },
  updateHideFoldersWhileSearching: (enabled: boolean) => {
    state.scanSettings.hideFoldersWhileSearching = enabled;
    renderRoot();
    emit({ type: 'updateHideFoldersWhileSearching', enabled });
  },
  updateExpandFoldersOnToggle: (enabled: boolean) => {
    state.scanSettings.expandFoldersOnToggle = enabled;
    renderRoot();
    emit({ type: 'updateExpandFoldersOnToggle', enabled });
  },
  addIgnoredFolder: () => {
    const folderInput = document.getElementById('new-folder') as HTMLInputElement | null;
    const errEl = document.getElementById('folder-error') as HTMLElement | null;
    if (!folderInput || !errEl) { return; }
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
  ignoreFolder: (folderPath: string) => {
    const normalized = normalizeRelativePath(folderPath);
    if (!normalized) { return; }
    if (state.scanSettings.ignoredFolders.includes(normalized)) { return; }
    removePredictedIgnoredFolder(normalized);
    state.scanSettings.ignoredFolders = [...state.scanSettings.ignoredFolders, normalized].sort((a, b) => a.localeCompare(b));
    renderRoot();
    emit({ type: 'addIgnoredFolder', folder: normalized });
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

