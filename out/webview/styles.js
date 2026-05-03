"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBVIEW_STYLES = void 0;
exports.WEBVIEW_STYLES = String.raw `
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

    .section-body { overflow: visible; }
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
    details.file-card {
      padding: 0;
    }
    .alert-summary {
      list-style: none;
      cursor: pointer;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .alert-summary::-webkit-details-marker { display: none; }

    .alert-chevron {
      margin-left: auto;
      color: var(--vscode-descriptionForeground);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    details.file-card[open] .alert-chevron {
      transform: rotate(90deg);
    }

    .file-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 5px;
      flex: 1;
      min-width: 0;
    }
    .file-name {
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      word-break: normal;
      flex: 1 1 auto;
      max-width: 100%;
      min-width: 0;
      cursor: pointer;
      color: var(--vscode-foreground);
    }
    .file-name:hover { color: var(--vscode-textLink-foreground); }

    .file-stats {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 2px 10px;
      flex-shrink: 0;
    }
    .alert-summary:hover .file-name {
      overflow: visible;
      text-overflow: clip;
    }
    .alert-summary:hover .file-stats span {
      visibility: hidden;
    }
    .alert-summary:hover .file-stats .overage {
      visibility: visible;
    }
    details.file-card[open] .file-stats {
      margin-bottom: 6px;
    }
    .file-stats span { margin-right: 0; }
    .overage { color: #e05050; font-weight: 600; white-space: nowrap; }

    .file-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: flex-start;
    }
    .file-actions-row {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      align-items: center;
    }
    details.file-card .file-actions {
      display: none;
    }
    details.file-card[open] .file-actions {
      display: flex;
      padding: 0 12px 8px;
    }

    .file-actions .ignore-label {
      margin-left: 0;
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
      border-radius: 4px;
      padding: 4px 10px;
      line-height: 1.45;
      transition: opacity 0.1s, background-color 0.1s;
    }
    button:hover { opacity: 0.85; }
    button:active { opacity: 0.7; }

    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-secondary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .btn-ghost {
      background: color-mix(in srgb, var(--vscode-button-background) 18%, transparent);
      color: var(--vscode-button-foreground);
      border: 1px solid color-mix(in srgb, var(--vscode-button-background) 60%, transparent);
    }
    .btn-danger {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid color-mix(in srgb, var(--vscode-button-background) 75%, transparent);
    }
    .btn-sm { padding: 2px 6px; font-size: 10px; }

    .settings-body { padding: 8px 12px 10px; }

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
    .settings-row-spaced {
      margin-bottom: 10px;
    }
    .add-custom-row input[type="text"] { width: 70px; }
    .add-custom-row input[type="number"] { width: 58px; }
    .folder-input {
      flex: 1;
      min-width: 120px;
    }

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
      margin-left: 0;
    }
    .folder-summary {
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .folder-toggle {
      width: 20px;
      height: 20px;
      min-width: 20px;
      padding: 0;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      border: 1px solid transparent;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .folder-toggle:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-foreground);
    }
    .folder-arrow {
      font-size: 12px;
      line-height: 1;
    }
    .folder-main-btn {
      background: transparent;
      color: inherit;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 2px 4px;
      display: inline-flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      text-align: left;
    }
    .folder-main-btn:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .folder-title {
      font-size: 12px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
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
    .folder-count {
      margin-left: 4px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }
    .folder-actions {
      margin-left: auto;
    }
    .folder-children {
      margin-left: 16px;
      padding-left: 8px;
      border-left: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
    }
    .folder-children.collapsed { display: none; }
    .configs-search {
      width: 100%;
    }
    /* --- Dropdown Polishing --- */
    .dropdown-container {
      position: relative;
      width: 100%;
    }

    .custom-select {
      appearance: none;
      display: flex;
      align-items: center;
      width: 100%;
      height: 32px;
      padding: 0 32px 0 10px;
      font-family: var(--vscode-font-family);
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      color: var(--vscode-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      outline: none;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
    
    .custom-select:hover {
      background: var(--vscode-input-background);
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }
    
    .custom-select:focus {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent);
    }

    .dropdown-container::after {
      content: '';
      position: absolute;
      top: 50%;
      right: 12px;
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid var(--vscode-descriptionForeground);
      transform: translateY(-50%);
      pointer-events: none;
      transition: transform 0.2s ease, border-top-color 0.2s ease;
    }
    
    .dropdown-container:focus-within::after {
      transform: translateY(-50%) rotate(180deg);
      border-top-color: var(--vscode-focusBorder);
    }

    /* Custom Dropdown Menu */
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      width: 100%;
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border));
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      display: none;
      flex-direction: column;
      padding: 4px;
      animation: fadeInSlide 0.15s ease-out;
    }

    .dropdown-container.open .dropdown-menu {
      display: flex;
    }

    .dropdown-item {
      padding: 6px 10px;
      font-size: 11px;
      color: var(--vscode-dropdown-foreground);
      border-radius: 4px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }

    .dropdown-item:hover {
      background: var(--vscode-list-hoverBackground);
      color: var(--vscode-list-hoverForeground);
    }

    .dropdown-item.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    /* --- Animations --- */
    @keyframes fadeInSlide {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .settings-body {
      padding: 8px 12px 10px;
    }

    .settings-mode {
      padding: 10px 12px 0;
      display: grid;
      gap: 6px;
    }

    /* Ensure specific overrides for our new styled selects */
    .settings-mode-select, .alerts-sort {
      composes: custom-select;
    }
    
    .settings-mode-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
      margin-left: 2px;
      margin-bottom: 2px;
    }

    /* Existing overrides / additions */
    select,
    .settings-mode-select {
      /* base style for any select we might have missed */
    }
    
    input[type="number"], input[type="text"], .prompt-template {
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    
    input[type="number"]:focus, input[type="text"]:focus, .prompt-template:focus {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 20%, transparent);
    }
    
    .section-body {
      transition: max-height 0.3s ease-in-out;
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
    .ignored-toolbar-compact,
    .ignored-note-compact {
      padding-left: 0;
      padding-right: 0;
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

    select,
    .settings-mode-select {
      font-family: var(--vscode-font-family);
      font-size: 11px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 6px;
      padding: 3px 6px;
    }
    select:focus,
    .settings-mode-select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      border-color: var(--vscode-focusBorder);
    }
    .scan-checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 11px;
    }
    input[type="checkbox"] {
      accent-color: var(--vscode-button-background);
      width: 14px;
      height: 14px;
    }
    .scan-field-label {
      display: block;
      margin-bottom: 5px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .scan-input {
      width: 100%;
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

    .loading-progress {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }

    .loading-progress-track {
      width: min(220px, 68vw);
      height: 6px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
      overflow: hidden;
      margin-top: 2px;
    }

    .loading-progress-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--vscode-button-background), var(--vscode-focusBorder, #007fd4));
      width: 0%;
      transition: width 160ms linear;
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
      background: linear-gradient(90deg, var(--vscode-descriptionForeground) 0%, var(--vscode-foreground) 50%, var(--vscode-descriptionForeground) 100%);
      background-size: 220% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: loading-shine 2.1s linear infinite;
    }

    @keyframes loading-shine {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .loading-state.visible {
      display: flex;
    }

    .content-hidden {
      display: none;
    }
`;
