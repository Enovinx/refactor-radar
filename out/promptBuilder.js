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
exports.PROMPT_TEMPLATE_VARIABLES = exports.DEFAULT_REFACTOR_PROMPT_TEMPLATE = void 0;
exports.buildRefactorPrompt = buildRefactorPrompt;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
exports.DEFAULT_REFACTOR_PROMPT_TEMPLATE = 'Refactor this file by splitting it while leaving behaviour the same and respecting the current project organisation. Target line count for individual files: [targetlinecount], over by [linecountover]. File path: [file path].';
exports.PROMPT_TEMPLATE_VARIABLES = [
    '[file content]',
    '[file path]',
    '[targetlinecount]',
    '[linecountover]',
];
function applyTemplate(template, replacements) {
    const aliases = {
        '[file content]': ['[file content]', '[filecontent]'],
        '[file path]': ['[file path]', '[filepath]'],
        '[targetlinecount]': ['[targetlinecount]'],
        '[linecountover]': ['[linecountover]'],
    };
    let output = template;
    for (const key of Object.keys(aliases)) {
        for (const token of aliases[key]) {
            output = output.split(token).join(replacements[key] ?? '');
        }
    }
    return output;
}
function toWorkspaceRelativePath(filePath) {
    try {
        const fileUri = vscode.Uri.file(filePath);
        const folder = vscode.workspace.getWorkspaceFolder(fileUri);
        if (!folder) {
            return filePath;
        }
        const relativePath = path.relative(folder.uri.fsPath, filePath);
        return relativePath || path.basename(filePath);
    }
    catch {
        return filePath;
    }
}
function buildRefactorPrompt(file, code, template) {
    const sourceTemplate = template && template.trim().length > 0
        ? template
        : exports.DEFAULT_REFACTOR_PROMPT_TEMPLATE;
    return applyTemplate(sourceTemplate, {
        '[file content]': code,
        '[file path]': toWorkspaceRelativePath(file.filePath),
        '[targetlinecount]': String(file.threshold),
        '[linecountover]': String(file.overage),
    });
}
