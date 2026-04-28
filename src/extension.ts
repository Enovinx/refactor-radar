import * as vscode from 'vscode';
import { FileTracker } from './fileTracker';
import { SidebarProvider } from './sidebarProvider';
import { buildRefactorPrompt } from './promptBuilder';

export function activate(context: vscode.ExtensionContext) {
  // ── Core services ─────────────────────────────────────────────────────────
  const tracker = new FileTracker(context, () => sidebar.refresh());
  const sidebar = new SidebarProvider(tracker);

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
    vscode.workspace.onDidSaveTextDocument(() => sidebar.refresh()),
    vscode.workspace.onDidOpenTextDocument(() => sidebar.refresh()),
    vscode.workspace.onDidCloseTextDocument(() => sidebar.refresh()),
    vscode.workspace.onDidChangeTextDocument(() => sidebar.refresh()),
    vscode.window.onDidChangeActiveTextEditor(() => sidebar.refresh()),
  );
}

export function deactivate() {}
