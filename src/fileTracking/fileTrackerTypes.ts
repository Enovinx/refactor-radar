export interface LanguageConfig {
  languageId: string;
  displayName: string;
  extension: string;
  lines: number;
  isCustom: boolean;
}

export interface TrackedFile {
  filePath: string;
  fileName: string;
  languageId: string;
  lineCount: number;
  threshold: number;
  overage: number;
}

export interface IgnoreEntry {
  kind: 'lines' | 'forever';
  untilLines?: number;
  bonusLines?: number;
  originalFilePath?: string;
  fileIdentity?: string;
}

export interface IgnoredFile {
  filePath: string;
  fileName: string;
  kind: 'lines' | 'forever';
  untilLines?: number;
  bonusLines?: number;
}

export interface FileCacheEntry {
  mtime: number;
  lineCount: number;
  languageId: string;
  filePath: string;
  fileIdentity?: string;
}

export interface ScanSettings {
  ignoreGitIgnore: boolean;
  maxFilesToScan: number | null;
  ignoredFolders: string[];
  hideFolders: boolean;
  hideFoldersWhileSearching: boolean;
}
