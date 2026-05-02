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
  alertCount: number;
}

function normalizeFolderSegments(filePath: string): string[] {
  const relative = getWorkspaceRelativePath(filePath);
  const parts = relative
    .split('/')
    .filter(Boolean)
    .filter(segment => segment !== '.' && segment !== '..');
  return parts.slice(0, Math.max(0, parts.length - 1));
}

function getCommonPrefixLength(segmentsList: string[][]): number {
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

function getAllNodePaths(node: FolderNode): string[] {
  const nested = Array.from(node.children.values()).flatMap(getAllNodePaths);
  return [...node.files.map(file => file.filePath), ...nested];
}

function computeAlertCounts(node: FolderNode): number {
  const childCount = Array.from(node.children.values()).reduce((sum, child) => sum + computeAlertCounts(child), 0);
  node.alertCount = node.files.length + childCount;
  return node.alertCount;
}

function buildFolderTree(files: TrackedFile[]): FolderNode {
  const root: FolderNode = { name: '', path: '', files: [], children: new Map(), alertCount: 0 };
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
      current = current.children.get(segment)!;
    }
    current.files.push(file);
  }

  computeAlertCounts(root);

  return root;
}


