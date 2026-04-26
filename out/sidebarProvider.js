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
exports.SidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const promptBuilder_1 = require("./promptBuilder");
const webview_1 = require("./webview");
class SidebarProvider {
    constructor(tracker) {
        this.tracker = tracker;
        this.statePushId = 0;
    }
    resolveWebviewView(webviewView, _context, _token) {
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
    refresh() {
        if (!this.view) {
            return;
        }
        // Debounce rapid refreshes (e.g. on fast typing)
        if (this.refreshDebounce) {
            clearTimeout(this.refreshDebounce);
        }
        this.refreshDebounce = setTimeout(() => this.pushState(), 150);
    }
    // ── Internal ──────────────────────────────────────────────────────────────
    async render() {
        if (!this.view) {
            console.log("Cancelled");
            return;
        }
        // Avoid stale Activity Bar badges while a new scan is in flight.
        this.updateBadge(0);
        const script = fs.readFileSync(path.join(__dirname, 'webview-script.js'), 'utf-8');
        this.view.webview.html = (0, webview_1.getWebviewContent)({
            files: [],
            ignoredFiles: this.tracker.getIgnoredFiles(),
            configs: this.tracker.getConfigs(),
            isLoading: true,
            promptTemplate: this.tracker.getPromptTemplate() || promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
            promptVariables: promptBuilder_1.PROMPT_TEMPLATE_VARIABLES,
            defaultPromptTemplate: promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
        }, script);
        console.log("Webview html set to...");
        console.log(this.view.webview.html);
        console.log("Webview coontent type: " + typeof this.view.webview.html);
        // Kick off the initial state push in the background.
        void this.pushState();
    }
    async pushState(forceRebuild = false) {
        if (!this.view) {
            return;
        }
        const pushId = ++this.statePushId;
        if (forceRebuild) {
            this.buildInFlight = undefined;
        }
        try {
            const state = await this.buildState();
            if (!this.view || pushId !== this.statePushId) {
                return;
            }
            this.updateBadge(state.files.length);
            this.view.webview.postMessage({ type: 'updateState', state: { ...state, isLoading: false } });
        }
        catch (err) {
            if (!this.view || pushId !== this.statePushId) {
                return;
            }
            console.error('Refactor Radar: failed to build state', err);
            // Keep the webview usable even if state build fails.
            this.updateBadge(0);
            this.view.webview.postMessage({
                type: 'updateState',
                state: {
                    files: [],
                    ignoredFiles: this.tracker.getIgnoredFiles(),
                    configs: this.tracker.getConfigs(),
                    isLoading: false,
                    promptTemplate: this.tracker.getPromptTemplate() || promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
                    promptVariables: promptBuilder_1.PROMPT_TEMPLATE_VARIABLES,
                    defaultPromptTemplate: promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
                },
            });
        }
    }
    updateBadge(alertCount) {
        if (!this.view) {
            return;
        }
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
    async buildState() {
        // Coalesce concurrent refreshes into a single scan.
        if (!this.buildInFlight) {
            this.buildInFlight = (async () => {
                console.log("Building state...");
                const [files, configs] = await Promise.all([
                    this.tracker.getOverThresholdFiles(),
                    Promise.resolve(this.tracker.getConfigs()),
                ]);
                return {
                    files,
                    ignoredFiles: this.tracker.getIgnoredFiles(),
                    configs,
                    isLoading: false,
                    promptTemplate: this.tracker.getPromptTemplate() || promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
                    promptVariables: promptBuilder_1.PROMPT_TEMPLATE_VARIABLES,
                    defaultPromptTemplate: promptBuilder_1.DEFAULT_REFACTOR_PROMPT_TEMPLATE,
                };
            })().finally(() => {
                this.buildInFlight = undefined;
            });
        }
        return this.buildInFlight;
    }
    bindMessages(webview) {
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
                        if (!file) {
                            return;
                        }
                        const prompt = (0, promptBuilder_1.buildRefactorPrompt)(file, doc.getText(), this.tracker.getPromptTemplate());
                        await vscode.env.clipboard.writeText(prompt);
                        vscode.window.showInformationMessage(`AI agent refactor prompt copied!`);
                    })();
                    break;
                }
                case 'savePromptTemplate': {
                    this.tracker.setPromptTemplate(String(msg.template || ''));
                    void this.pushState(true);
                    break;
                }
                case 'resetPromptTemplate': {
                    this.tracker.resetPromptTemplate();
                    void this.pushState(true);
                    break;
                }
                case 'ignoreForLines': {
                    void (async () => {
                        await this.tracker.ignoreForLines(msg.filePath, msg.lineCount, msg.extra);
                        await this.pushState(true);
                    })();
                    break;
                }
                case 'ignoreForever': {
                    void (async () => {
                        await this.tracker.ignoreForever(msg.filePath);
                        await this.pushState(true);
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
            }
        });
    }
}
exports.SidebarProvider = SidebarProvider;
