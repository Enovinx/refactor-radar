import { LanguageConfig, TrackedFile } from './fileTracker';

export interface IgnoredFile {
  filePath: string;
  fileName: string;
  kind: 'lines' | 'forever';
  untilLines?: number;
  bonusLines?: number;
}

export interface WebviewState {
  files: TrackedFile[];
  ignoredFiles: IgnoredFile[];
  configs: LanguageConfig[];
  scanSettings: {
    ignoreGitIgnore: boolean;
    maxFilesToScan: number | null;
    ignoredFolders: string[];
  };
  isLoading: boolean;
  promptTemplate: string;
  promptVariables: string[];
  batchPromptTemplate: string;
  batchPromptVariables: string[];
  defaultBatchPromptTemplate: string;
  defaultPromptTemplate: string;
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function getWebviewContent(state: WebviewState, script: string): string {
  const nonce = getNonce();
  const stateJson = JSON.stringify(state);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refactor Radar</title>
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      overflow-x: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
      background: var(--vscode-sideBarSectionHeader-background, transparent);
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
      cursor: pointer;
      user-select: none;
      gap: 6px;
    }
    .section-header:hover { opacity: 0.85; }
    .section-header .chevron {
      font-size: 10px;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .section-header .chevron.collapsed { transform: rotate(-90deg); }
    .section-header .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-left: auto;
      margin-right: 4px;
    }

    .section-body { overflow: hidden; }
    .section-body.collapsed { display: none; }

    .empty-state {
      padding: 20px 16px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.6;
    }
    .empty-state .icon { font-size: 28px; display: block; margin-bottom: 8px; }

    .file-card {
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      padding: 8px 12px;
    }
    .file-card:last-child { border-bottom: none; }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
      min-width: 0;
    }
    .file-name {
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      cursor: pointer;
      color: var(--vscode-foreground);
    }
    .file-name:hover { color: var(--vscode-textLink-foreground); }

    .file-stats {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .file-stats span { margin-right: 10px; }
    .overage { color: #e05050; font-weight: 600; }

    .file-actions {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .file-actions .ignore-label {
      margin-left: 12px;
      margin-right: 2px;
      align-self: center;
    }

    .file-actions button {
      min-width: 0;
      max-width: 100%;
    }

    button {
      font-family: var(--vscode-font-family);
      font-size: 11px;
      cursor: pointer;
      border: none;
      border-radius: 3px;
      padding: 3px 8px;
      line-height: 1.5;
      transition: opacity 0.1s;
    }
    button:hover { opacity: 0.85; }
    button:active { opacity: 0.7; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .btn-ghost {
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3));
    }
    .btn-danger {
      background: transparent;
      color: #e05050;
      border: 1px solid rgba(204,60,60,0.35);
    }
    .btn-sm { padding: 2px 6px; font-size: 10px; }

    .settings-body { padding: 8px 12px 12px; }

    .settings-description {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 10px;
      line-height: 1.5;
    }

    .threshold-table { width: 100%; border-collapse: collapse; }
    .threshold-table th {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--vscode-descriptionForeground);
      text-align: left;
      padding: 0 4px 5px;
    }
    .threshold-table td {
      padding: 3px 4px;
      vertical-align: middle;
    }
    .threshold-table tr:hover td { background: var(--vscode-list-hoverBackground); }

    .lang-name { font-size: 14px; font-weight: 600; }
    .lang-name.custom-lang { color: var(--vscode-textLink-foreground); }
    .lang-ext  { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

    input[type="number"] {
      width: 62px;
      font-family: var(--vscode-font-family);
      font-size: 11px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 2px 5px;
      text-align: right;
    }
    input[type="number"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    input[type="text"] {
      font-family: var(--vscode-font-family);
      font-size: 11px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 3px 6px;
    }
    input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }

    .settings-divider {
      border: none;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      margin: 10px 0;
    }

    .add-custom-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 6px;
    }

    .add-custom-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .add-custom-row input[type="text"] { width: 70px; }
    .add-custom-row input[type="number"] { width: 58px; }

    .configs-toolbar {
      margin-bottom: 12px;
    }
    .alerts-toolbar {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    }
    .alerts-search { flex: 1; }
    .alerts-sort {
      font-family: var(--vscode-font-family);
      font-size: 11px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      padding: 3px 6px;
    }
    .folder-node {
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
      margin-left: 6px;
    }
    .folder-summary {
      list-style: none;
      cursor: pointer;
      padding: 6px 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .folder-summary::-webkit-details-marker { display: none; }
    .folder-title {
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .folder-icon {
      color: var(--vscode-descriptionForeground);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    .folder-children { margin-left: 8px; }
    .configs-search {
      width: 100%;
    }

    .error-msg {
      font-size: 11px;
      color: #e05050;
      margin-top: 4px;
    }

    .nav-bar {
      display: flex;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    }
    .nav-tab {
      flex: 1;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
    }
    .nav-tab:hover {
      color: var(--vscode-foreground);
    }
    .nav-tab.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--vscode-focusBorder, #007fd4);
    }

    .panel-alerts, .panel-configs, .panel-ignored {
      display: none;
    }
    .panel-alerts.visible, .panel-configs.visible, .panel-ignored.visible, .panel-prompts.visible {
      display: block;
    }

    .ignored-toolbar {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    }

    .ignored-search {
      width: 100%;
    }

    .ignored-note {
      padding: 8px 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.1));
      line-height: 1.4;
    }

    .ignored-details {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }

    .panel-prompts {
      display: none;
    }

    .prompt-vars-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }

    .prompt-template {
      width: 100%;
      min-height: 180px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      font-size: 12px;
      line-height: 1.4;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 8px;
      margin-bottom: 8px;
    }
    .prompt-template:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }

    .prompt-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .loading-state {
      display: none;
      padding: 18px 12px 30px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      min-height: 100vh;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
    }

    .loading-title {
      font-weight: 600;
      color: var(--vscode-foreground);
      margin-bottom: 6px;
    }

    .loading-puzzle {
      display: inline-grid;
      place-items: center;
      margin-top: 8px;
    }

    .puzzle-row {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
    }

    .puzzle-row:last-child {
      margin-bottom: 0;
    }

    .puzzle-cell {
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
      border-radius: 4px;
      background: var(--vscode-input-background);
      color: var(--vscode-foreground);
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
      line-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .puzzle-cell:hover {
      border-color: var(--vscode-focusBorder, #007fd4);
    }

    .loading-message {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .loading-state.visible {
      display: flex;
    }

    .content-hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script nonce="${nonce}">${script}</script>
</body>
</html>`;
}
