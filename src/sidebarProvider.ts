import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileTracker } from './fileTracker';
import {
  BATCH_PROMPT_TEMPLATE_VARIABLES,
  buildRefactorPrompt,
  buildBatchRefactorPrompt,
  DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
  DEFAULT_REFACTOR_PROMPT_TEMPLATE,
  PROMPT_TEMPLATE_VARIABLES,
} from './promptBuilder';
import { getWebviewContent } from './webview/index';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private refreshDebounce?: ReturnType<typeof setTimeout>;
  private statePushId = 0;
  private buildInFlight?: Promise<{
    files: any[];
    ignoredFiles: any[];
    configs: any[];
    scanSettings: any;
    promptTemplate: string;
    promptVariables: string[];
    batchPromptTemplate: string;
    batchPromptVariables: string[];
    defaultBatchPromptTemplate: string;
    defaultPromptTemplate: string;
  }>;

  constructor(private readonly tracker: FileTracker) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
   // console.log("Sidebar view resolved (src)");
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      // No localResourceRoots needed — all content is inlined
    };

    // Render immediately so the panel never stays blank while we scan.
    this.render();
    this.bindMessages(webviewView.webview);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  refresh(force = false) {
    if (!this.view) { return; }
    // Debounce rapid refreshes (e.g. on fast typing)
    if (this.refreshDebounce) { clearTimeout(this.refreshDebounce); }
    this.refreshDebounce = setTimeout(() => this.pushState(force), 150);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async render() {
    if (!this.view) {
      console.log("Cancelled");
       return; 
    }

    // Avoid stale Activity Bar badges while a new scan is in flight.
    this.updateBadge(0);

    const script = fs.readFileSync(path.join(__dirname, 'webview-script.js'), 'utf-8');
    this.view.webview.html = getWebviewContent({
      files: [],
      ignoredFiles: this.tracker.getIgnoredFiles(),
      configs: this.tracker.getConfigs(),
      scanSettings: this.tracker.getScanSettings(),
      workspaceRoot: this.tracker.getWorkspaceRoot(),
      isLoading: true,
      loadingProgress: 0,
      promptTemplate: this.tracker.getPromptTemplate() || DEFAULT_REFACTOR_PROMPT_TEMPLATE,
      promptVariables: PROMPT_TEMPLATE_VARIABLES,
      batchPromptTemplate: this.tracker.getBatchPromptTemplate() || DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
      batchPromptVariables: BATCH_PROMPT_TEMPLATE_VARIABLES,
      defaultBatchPromptTemplate: DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
      defaultPromptTemplate: DEFAULT_REFACTOR_PROMPT_TEMPLATE,
    }, script);
    console.log("Webview html set to...");
    console.log(this.view.webview.html);
    console.log("Webview coontent type: " + typeof this.view.webview.html);
    // Kick off the initial state push in the background.
    void this.pushState();
  }

  private async pushState(forceRebuild = false) {
    if (!this.view) { return; }
    const pushId = ++this.statePushId;

    if (forceRebuild) {
      this.buildInFlight = undefined;
    }

    try {
      const state = await this.buildState(forceRebuild);
      if (!this.view || pushId !== this.statePushId) { return; }
      this.updateBadge(state.files.length);
      this.view.webview.postMessage({ type: 'updateState', state: { ...state, isLoading: false, loadingProgress: 100 } });
    } catch (err) {
      if (!this.view || pushId !== this.statePushId) { return; }
      console.error('Refactor Radar: failed to build state', err);
      // Keep the webview usable even if state build fails.
      this.updateBadge(0);
      this.view.webview.postMessage({
        type: 'updateState',
        state: {
          files: [],
          ignoredFiles: this.tracker.getIgnoredFiles(),
          configs: this.tracker.getConfigs(),
          scanSettings: this.tracker.getScanSettings(),
          workspaceRoot: this.tracker.getWorkspaceRoot(),
          isLoading: false,
          loadingProgress: 100,
          promptTemplate: this.tracker.getPromptTemplate() || DEFAULT_REFACTOR_PROMPT_TEMPLATE,
          promptVariables: PROMPT_TEMPLATE_VARIABLES,
          batchPromptTemplate: this.tracker.getBatchPromptTemplate() || DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
          batchPromptVariables: BATCH_PROMPT_TEMPLATE_VARIABLES,
          defaultBatchPromptTemplate: DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
          defaultPromptTemplate: DEFAULT_REFACTOR_PROMPT_TEMPLATE,
        },
      });
    }
  }

  private updateBadge(alertCount: number) {
    if (!this.view) { return; }
    const normalizedCount = Number.isFinite(alertCount) && alertCount > 0
      ? Math.floor(alertCount)
      : 0;

    if (normalizedCount === 0) {
      // Some VS Code builds can keep showing a stale badge when clearing directly.
      // Toggling through zero first reliably removes it.
      if (this.view.badge) {
        this.view.badge = { value: 0, tooltip: 'No refactor alerts' };
      }
      this.view.badge = undefined;
      return;
    }

    this.view.badge = {
      value: normalizedCount,
      tooltip: `${normalizedCount} refactor alert${normalizedCount === 1 ? '' : 's'}`,
    };
  }

  private async buildState(forceRefresh = false) {
    // Coalesce concurrent refreshes into a single scan.
    if (!this.buildInFlight) {
      this.buildInFlight = (async () => {
        console.log("Building state...");
        const [files, configs] = await Promise.all([
          this.tracker.getOverThresholdFiles(forceRefresh),
          Promise.resolve(this.tracker.getConfigs()),
        ]);
        return {
          files,
          ignoredFiles: this.tracker.getIgnoredFiles(),
          configs,
          scanSettings: this.tracker.getScanSettings(),
          workspaceRoot: this.tracker.getWorkspaceRoot(),
          isLoading: false,
          promptTemplate: this.tracker.getPromptTemplate() || DEFAULT_REFACTOR_PROMPT_TEMPLATE,
          promptVariables: PROMPT_TEMPLATE_VARIABLES,
          batchPromptTemplate: this.tracker.getBatchPromptTemplate() || DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
          batchPromptVariables: BATCH_PROMPT_TEMPLATE_VARIABLES,
          defaultBatchPromptTemplate: DEFAULT_BATCH_REFACTOR_PROMPT_TEMPLATE,
          defaultPromptTemplate: DEFAULT_REFACTOR_PROMPT_TEMPLATE,
        };
      })().finally(() => {
        this.buildInFlight = undefined;
      });
    }
    return this.buildInFlight;
  }

  private bindMessages(webview: vscode.Webview) {
    webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {

        case 'openFile': {
          void (async () => {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.filePath));
            await vscode.window.showTextDocument(doc);
          })();
          break;
        }

        case 'copyPrompt': {
          console.log(msg.filePath);
          void (async () => {
            const doc = await this.tracker.getDocumentByPath(msg.filePath);
            if (!doc) {
              vscode.window.showErrorMessage(`Document not found for ${msg.filePath}`);
              return;
            }
            
            // Use the file data passed from frontend instead of rescanning
            const file = msg.fileData;
            if (!file) { return; }

            const prompt = buildRefactorPrompt(file, doc.getText(), this.tracker.getPromptTemplate());
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage(
              `AI agent refactor prompt copied!`
            );
          })();
          break;
        }

        case 'copyBatchPrompt': {
          void (async () => {
            const folderName = String(msg.folderName || '').trim();
            const filePaths = Array.isArray(msg.filePaths)
              ? msg.filePaths.map(String).filter(Boolean)
              : [];
            if (!folderName || filePaths.length === 0) {
              return;
            }

            const prompt = buildBatchRefactorPrompt(
              folderName,
              filePaths,
              this.tracker.getBatchPromptTemplate()
            );
            await vscode.env.clipboard.writeText(prompt);
            vscode.window.showInformationMessage('AI batch refactor prompt copied!');
          })();
          break;
        }

        case 'savePromptTemplate': {
          this.tracker.setPromptTemplate(String(msg.template || ''));
          void this.pushState(true);
          break;
        }

        case 'saveBatchPromptTemplate': {
          this.tracker.setBatchPromptTemplate(String(msg.template || ''));
          void this.pushState(true);
          break;
        }

        case 'resetPromptTemplate': {
          this.tracker.resetPromptTemplate();
          void this.pushState(true);
          break;
        }

        case 'resetBatchPromptTemplate': {
          this.tracker.resetBatchPromptTemplate();
          void this.pushState(true);
          break;
        }

        case 'ignoreForLines': {
          void (async () => {
            await this.tracker.ignoreForLines(msg.filePath, msg.lineCount, msg.extra);
            this.tracker.removeFileFromLastScan(msg.filePath);
            await this.pushState(false);
          })();
          break;
        }

        case 'ignoreForever': {
          void (async () => {
            await this.tracker.ignoreForever(msg.filePath);
            this.tracker.removeFileFromLastScan(msg.filePath);
            await this.pushState(false);
          })();
          break;
        }

        case 'removeLineBonus': {
          this.tracker.removeLineBonus(msg.filePath);
          void this.pushState(true);
          break;
        }

        case 'cancelPermanentIgnore': {
          this.tracker.cancelPermanentIgnore(msg.filePath);
          void this.pushState(true);
          break;
        }

        case 'updateThreshold': {
          this.tracker.updateThreshold(msg.languageId, msg.lines);
          void this.pushState(true);
          break;
        }

        case 'addCustom': {
          this.tracker.addCustomConfig(msg.extension, msg.lines);
          void this.pushState(true);
          break;
        }

        case 'removeCustom': {
          this.tracker.removeCustomConfig(msg.languageId);
          void this.pushState(true);
          break;
        }

        case 'updateIgnoreGitIgnore': {
          this.tracker.updateIgnoreGitIgnore(Boolean(msg.enabled));
          void this.pushState(true);
          break;
        }

        case 'updateMaxFilesToScan': {
          const parsed = Number(msg.maxFilesToScan);
          this.tracker.updateMaxFilesToScan(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
          void this.pushState(true);
          break;
        }

        case 'updateHideFolders': {
          this.tracker.updateHideFolders(Boolean(msg.enabled));
          void this.pushState(true);
          break;
        }

        case 'updateHideFoldersWhileSearching': {
          this.tracker.updateHideFoldersWhileSearching(Boolean(msg.enabled));
          void this.pushState(true);
          break;
        }

        case 'addIgnoredFolder': {
          this.tracker.addIgnoredFolder(String(msg.folder || ''));
          this.tracker.removeFolderFromLastScan(String(msg.folder || ''));
          void this.pushState(false);
          break;
        }

        case 'removeIgnoredFolder': {
          this.tracker.removeIgnoredFolder(String(msg.folder || ''));
          void this.pushState(true);
          break;
        }
      }
    });
  }
}
