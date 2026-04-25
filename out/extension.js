"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fileTracker_1 = require("./fileTracker");
const sidebarProvider_1 = require("./sidebarProvider");
const promptBuilder_1 = require("./promptBuilder");
function activate(context) {
    // ── Core services ─────────────────────────────────────────────────────────
    const tracker = new fileTracker_1.FileTracker(context, () => sidebar.refresh());
    const sidebar = new sidebarProvider_1.SidebarProvider(tracker);
    // ── Register sidebar view ─────────────────────────────────────────────────
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('refactorRadar.panel', sidebar, {
        webviewOptions: { retainContextWhenHidden: true },
    }));
    // Ensure the extension activates when the view is opened.
    // (Without an activationEvent, the sidebar provider may never be registered.)
    console.log('Refactor Radar: activated');
    // ── Refresh command ───────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('refactorRadar.refresh', () => {
        sidebar.refresh();
    }));
    // ── Copy prompt for current file (command palette / keybinding) ───────────
    context.subscriptions.push(vscode.commands.registerCommand('refactorRadar.copyPromptForFile', async () => {
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
        const prompt = (0, promptBuilder_1.buildRefactorPrompt)(file, doc.getText(), tracker.getPromptTemplate());
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage(`AI refactor prompt for ${file.fileName} copied to clipboard.`);
    }));
    // ── Refresh panel on file events ──────────────────────────────────────────
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => sidebar.refresh()), vscode.workspace.onDidOpenTextDocument(() => sidebar.refresh()), vscode.workspace.onDidCloseTextDocument(() => sidebar.refresh()), vscode.workspace.onDidChangeTextDocument(() => sidebar.refresh()), vscode.window.onDidChangeActiveTextEditor(() => sidebar.refresh()));
}
function deactivate() { }
