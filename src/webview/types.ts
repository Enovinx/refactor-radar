import { LanguageConfig, TrackedFile } from '../fileTracker';

export interface IgnoredFile {
  filePath: string;
  fileName: string;
  kind: 'lines' | 'forever';
  untilLines?: number;
  bonusLines?: number;
}

export interface WebviewState {
  files: TrackedFile[];
  ignoredFiles: IgnoredFile[];
  configs: LanguageConfig[];
  scanSettings: {
    ignoreGitIgnore: boolean;
    maxFilesToScan: number | null;
    ignoredFolders: string[];
  };
  isLoading: boolean;
  loadingProgress: number;
  promptTemplate: string;
  promptVariables: string[];
  batchPromptTemplate: string;
  batchPromptVariables: string[];
  defaultBatchPromptTemplate: string;
  defaultPromptTemplate: string;
}
