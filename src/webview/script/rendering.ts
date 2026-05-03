const render = {
  fileCard: (file: TrackedFile): string => {
    const { escHtml } = utils;
    const encodedPath = encodeURIComponent(file.filePath);
    const isActive = state2.activeFileCard === file.filePath;
    const relativePath = getWorkspaceRelativePath(file.filePath);
    const displayPath = relativePath || file.filePath;
    const displayMode = state.scanSettings.limitDisplayMode || 'customOnly';
    let showLimit = false;
    if (displayMode === 'always') showLimit = true;
    else if (displayMode === 'customOnly') showLimit = file.isCustomLimit;
    else if (displayMode === 'off') showLimit = false;

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
  folderNode: (node: FolderNode): string => {
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
        : '<div>' + state.scanSettings.ignoredFolders.map(folder =>
          '<div class="file-card"><div class="file-meta"><span class="file-name" title="' + utils.escHtml(folder) + '">' + utils.escHtml(folder) + '</span></div>' +
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
  ensureLoadingProgressTimer();
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

