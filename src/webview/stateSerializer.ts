import { WebviewState } from './types';

export function serializeState(state: WebviewState): string {
  return JSON.stringify(state);
}
