import { LanguageConfig, TrackedFile, ScanSettings } from '../fileTracker';

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
  scanSettings: ScanSettings;
  workspaceRoot: string | null;
  refreshIntervalMs: number;
  isLoading: boolean;
  loadingProgress: number;
  promptTemplate: string;
  promptVariables: string[];
  batchPromptTemplate: string;
  batchPromptVariables: string[];
  defaultBatchPromptTemplate: string;
  defaultPromptTemplate: string;
}
