import { TrackedFile } from './fileTracker';
import * as path from 'path';
import * as vscode from 'vscode';

export const DEFAULT_REFACTOR_PROMPT_TEMPLATE =
  'Refactor this file by splitting it while leaving behaviour the same and respecting the current project organisation. Target line count for individual files: [targetlinecount], over by [linecountover]. File path: [file path].';

export const PROMPT_TEMPLATE_VARIABLES = [
  '[file content]',
  '[file path]',
  '[targetlinecount]',
  '[linecountover]',
];

function applyTemplate(template: string, replacements: Record<string, string>): string {
  const aliases: Record<string, string[]> = {
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

function toWorkspaceRelativePath(filePath: string): string {
  try {
    const fileUri = vscode.Uri.file(filePath);
    const folder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!folder) {
      return filePath;
    }

    const relativePath = path.relative(folder.uri.fsPath, filePath);
    return relativePath || path.basename(filePath);
  } catch {
    return filePath;
  }
}

export function buildRefactorPrompt(file: TrackedFile, code: string, template?: string): string {
  const sourceTemplate = template && template.trim().length > 0
    ? template
    : DEFAULT_REFACTOR_PROMPT_TEMPLATE;

  return applyTemplate(sourceTemplate, {
    '[file content]': code,
    '[file path]': toWorkspaceRelativePath(file.filePath),
    '[targetlinecount]': String(file.threshold),
    '[linecountover]': String(file.overage),
  });
}
