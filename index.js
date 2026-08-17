/**
 * Host half of dsh-conversation-outline.
 *
 * This plugin is client-only: all behaviour lives in client.js. The host half
 * still has to exist, because the client-module scanner only serves the browser
 * bundle for packages whose loader entry has a live fiber
 * (packages/client/modules/src/index.ts). An empty apply() is enough to keep
 * that entry alive.
 */

export const name = 'conversation-outline'

export function apply() {}
