import { createContentSecurityPolicy } from './contentSecurityPolicy';
import { WEBVIEW_STYLES } from './styles';

export function buildWebviewHtml(nonce: string, stateJson: string, script: string): string {
  const csp = createContentSecurityPolicy(nonce);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refactor Radar</title>
  <style nonce="${nonce}">
${WEBVIEW_STYLES}
  </style>
</head>
<body>
  <div id="root"></div>

  <script nonce="${nonce}">
    window.__STATE__ = ${stateJson};
  </script>
  <script nonce="${nonce}">
${script}
  </script>
</body>
</html>`;
}
