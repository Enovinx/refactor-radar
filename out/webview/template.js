"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewHtml = buildWebviewHtml;
const contentSecurityPolicy_1 = require("./contentSecurityPolicy");
const styles_1 = require("./styles");
function buildWebviewHtml(nonce, stateJson, script) {
    const csp = (0, contentSecurityPolicy_1.createContentSecurityPolicy)(nonce);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Refactor Radar</title>
  <style nonce="${nonce}">
${styles_1.WEBVIEW_STYLES}
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
