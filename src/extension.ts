import * as vscode from 'vscode';
import { FileTracker } from './fileTracker';
import { SidebarProvider } from './sidebarProvider';
import { buildRefactorPrompt } from './promptBuilder';
import { BadgeTreeViewProvider } from './badgeTreeView';

export function activate(context: vscode.ExtensionContext) {
  // ── Core services ─────────────────────────────────────────────────────────
  let sidebar: SidebarProvider;
  const tracker = new FileTracker(context, () => sidebar.refresh());
  sidebar = new SidebarProvider(tracker);
  const badgeTreeProvider = new BadgeTreeViewProvider();
  const badgeTreeView = vscode.window.createTreeView('refactorRadar.badge', {
    treeDataProvider: badgeTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(badgeTreeView);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'workbench.view.extension.refactorRadar';
  statusBar.text = '$(alert) Refactor Radar: 0';
  statusBar.tooltip = 'No refactor alerts';
  statusBar.show();
  context.subscriptions.push(statusBar);

  const updateStatusBar = (count: number) => {
    statusBar.text = `$(alert) Refactor Radar: ${Math.max(0, count)}`;
    statusBar.tooltip = count > 0
      ? `${count} file${count === 1 ? '' : 's'} over threshold`
      : 'No refactor alerts';
    statusBar.show();
  };

  const updateIndicators = async (force = false) => {
    try {
      const files = await tracker.getOverThresholdFiles(force);
      const count = files.length;
      sidebar.setBadgeCount(count);
      badgeTreeView.badge = count > 0
        ? { value: count, tooltip: `${count} refactor alert${count === 1 ? '' : 's'}` }
        : undefined;
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
        sidebar.refresh();
      }
    }),
  );
}

export function deactivate() {}
