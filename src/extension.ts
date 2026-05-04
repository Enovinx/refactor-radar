import * as vscode from 'vscode';
import { FileTracker } from './fileTracker';
import { SidebarProvider } from './sidebarProvider';
import { buildRefactorPrompt } from './promptBuilder';

export function activate(context: vscode.ExtensionContext) {
  // ── Core services ─────────────────────────────────────────────────────────
  const tracker = new FileTracker(context, () => sidebar.refresh());
  const sidebar = new SidebarProvider(tracker);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'workbench.view.extension.refactorRadar';
  statusBar.text = 'Refactor Radar';
  statusBar.tooltip = 'Refactor Radar alerts';
  statusBar.hide();
  context.subscriptions.push(statusBar);

  const updateStatusBar = (count: number) => {
    if (count > 0) {
      statusBar.text = `Refactor Radar: ${count}`;
      statusBar.tooltip = `${count} file${count === 1 ? '' : 's'} over threshold`;
      statusBar.show();
    } else {
      statusBar.text = 'Refactor Radar';
      statusBar.tooltip = 'No refactor alerts';
      statusBar.hide();
    }
  };

  const updateIndicators = async (force = false) => {
    try {
      const files = await tracker.getOverThresholdFiles(force);
      const count = files.length;
      sidebar.setBadgeCount(count);
      updateStatusBar(count);
    } catch (err) {
      console.error('Refactor Radar: background update failed', err);
    }
  };

  // Warm the tracker on startup so data is ready before the view opens.
  void tracker.getOverThresholdFiles(false).catch(err => {
    console.error('Refactor Radar: warm scan failed', err);
  });

  // Run an initial background refresh so indicators show without opening the view.
  void updateIndicators(true);

  const getRefreshInterval = () => {
    return vscode.workspace.getConfiguration('refactorRadar').get<number>('refreshIntervalMs', 5000);
  };

  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  const startRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    const interval = Math.max(1000, getRefreshInterval());
    refreshTimer = setInterval(() => {
      void updateIndicators(false);
    }, interval);
  };
  startRefreshTimer();
  context.subscriptions.push(new vscode.Disposable(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  }));

  // ── Register sidebar view ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('refactorRadar.panel', sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // Ensure the extension activates when the view is opened.
  // (Without an activationEvent, the sidebar provider may never be registered.)
  console.log('Refactor Radar: activated');

  // ── Refresh command ───────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('refactorRadar.refresh', () => {
      void updateIndicators(true);
      sidebar.refresh(true);
    })
  );

  // ── Copy prompt for current file (command palette / keybinding) ───────────
  context.subscriptions.push(
    vscode.commands.registerCommand('refactorRadar.copyPromptForFile', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || doc.uri.scheme !== 'file') {
        vscode.window.showErrorMessage('Refactor Radar: No active file.');
        return;
      }
      const threshold = tracker.getThreshold(doc);
      const file = {
        filePath: doc.fileName,
        fileName: require('path').basename(doc.fileName),
        languageId: doc.languageId,
        lineCount: doc.lineCount,
        threshold,
        overage: Math.max(0, doc.lineCount - threshold),
        isCustomLimit: false,
      };
      const prompt = buildRefactorPrompt(file, doc.getText(), tracker.getPromptTemplate());
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage(
        `AI refactor prompt for ${file.fileName} copied to clipboard.`
      );
    })
  );

  // ── Refresh panel on file events ──────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      void updateIndicators(false);
      sidebar.refresh();
    }),
    vscode.workspace.onDidOpenTextDocument(() => {
      void updateIndicators(false);
      sidebar.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument(() => {
      void updateIndicators(false);
      sidebar.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument(() => {
      void updateIndicators(false);
      sidebar.refresh();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void updateIndicators(false);
      sidebar.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('refactorRadar.refreshIntervalMs')) {
        startRefreshTimer();
      }
    }),
  );
}

export function deactivate() {}
