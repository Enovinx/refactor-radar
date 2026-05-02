import { getNonce } from './nonce';
import { serializeState } from './stateSerializer';
import { buildWebviewHtml } from './template';
import { WebviewState } from './types';

export type { IgnoredFile, WebviewState } from './types';

export function getWebviewContent(state: WebviewState, script: string): string {
  const nonce = getNonce();
  const stateJson = serializeState(state);
  return buildWebviewHtml(nonce, stateJson, script);
}
