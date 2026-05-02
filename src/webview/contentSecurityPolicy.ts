export function createContentSecurityPolicy(nonce: string): string {
  return `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
}
