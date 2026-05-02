"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
const nonce_1 = require("./nonce");
const stateSerializer_1 = require("./stateSerializer");
const template_1 = require("./template");
function getWebviewContent(state, script) {
    const nonce = (0, nonce_1.getNonce)();
    const stateJson = (0, stateSerializer_1.serializeState)(state);
    return (0, template_1.buildWebviewHtml)(nonce, stateJson, script);
}
