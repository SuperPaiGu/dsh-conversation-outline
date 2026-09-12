// @vitest-environment jsdom
/**
 * Test harness for the browser half.
 *
 * client.js is not an importable module in the normal sense: it self-registers
 * by calling window.__ModuleLoader__.load({ id, factory }) at execution time,
 * and its factory resolves dependencies through dsh's frozen platform `require`.
 * So we stub both, execute the file, and capture the materialised plugin object.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import React from 'react'

const here = dirname(fileURLToPath(import.meta.url))
const clientSource = readFileSync(join(here, '..', 'client.js'), 'utf8')

/** Platform modules dsh exposes to a client bundle. */
const PLATFORM = {
  react: React,
  'react/jsx-runtime': await import('react/jsx-runtime'),
}

let plugin

/**
 * Execute client.js against stubbed globals and return the plugin object.
 * @returns {{ inject: string[], apply: Function, __test__: Record<string, unknown> }}
 */
export function loadPlugin() {
  if (plugin !== undefined) return plugin
  let captured
  const loader = {
    load(entry) {
      captured = entry.factory((spec) => {
        if (spec in PLATFORM) return PLATFORM[spec]
        throw new Error(`unexpected require(${spec})`)
      })
    },
  }
  const previous = window.__ModuleLoader__
  window.__ModuleLoader__ = loader
  try {
    // eslint-disable-next-line no-new-func -- mirrors the loader executing the bundle
    new Function(clientSource)()
  } finally {
    window.__ModuleLoader__ = previous
  }
  if (captured === undefined) throw new Error('client.js did not register a factory')
  plugin = captured
  return plugin
}



/**
 * Build a chat snapshot slice plus the useSession selector hook the framework
 * hands to session-scope slot components.
 * @param {ReadonlyArray<{ key: string, kind?: string, seq?: number, text: string, time?: number }>} rows
 * @param {{ hasMore?: boolean, loadingOlder?: boolean }} [options]
 */
/** Expose the plugin's own locale dictionaries so tests stay aligned with production keys. */
const pluginInstance = loadPlugin()
const { LOCALES, makeT } = pluginInstance.__test__
export { LOCALES, makeT }

export function makeUseSession(rows, options = {}) {
  const snapshot = sessionSnapshot(rows, options)
  return selector => selector(snapshot)
}

/**
 * The raw session-scope snapshot shape the rail consumes: the chat projection
 * (order + node store) plus the pagination flags `useSession` owns.
 * @param {readonly {key: string, kind?: string, seq?: number, time?: number, text?: string}[]} rows
 * @param {{ hasMore?: boolean, loadingOlder?: boolean }} [options]
 */
export function sessionSnapshot(rows, options = {}) {
  const order = rows.map(row => row.key)
  const map = new Map(rows.map(row => [row.key, {
    key: row.key,
    kind: row.kind ?? 'user',
    id: row.key,
    target: 'chat',
    anchorSeq: row.seq ?? 0,
    visibility: 'visible',
    data: {
      kind: row.kind ?? 'user',
      seq: row.seq ?? 0,
      time: row.time ?? 0,
      content: [{ type: 'text', text: row.text }],
      source: null,
    },
  }]))
  return {
    chat: {
      order,
      nodes: { get: key => map.get(key), values: () => map.values() },
    },
    hasMore: options.hasMore ?? false,
    loadingOlder: options.loadingOlder ?? false,
  }
}
