import * as vscode from 'vscode';

export class BadgeTreeViewProvider implements vscode.TreeDataProvider<void> {
  getTreeItem(): vscode.TreeItem {
    return new vscode.TreeItem('');
  }

  getChildren(): void[] {
    return [];
  }
}
