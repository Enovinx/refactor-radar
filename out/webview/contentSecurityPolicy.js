"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContentSecurityPolicy = createContentSecurityPolicy;
function createContentSecurityPolicy(nonce) {
    return `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
}
