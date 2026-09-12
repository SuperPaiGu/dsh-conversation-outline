/**
 * dsh-conversation-outline, browser half.
 *
 * Renders a minimal right-side navigation rail of user questions in the
 * current session. Default state is a thin column of dash indicators.
 * Hovering an indicator shows a card with the sequence number, relative
 * time, and text preview. Scrolling the conversation auto-highlights the
 * indicator for the message currently in view. Clicking an indicator
 * scrolls to it, loading older history first when necessary.
 *
 * Composition:
 *   - 'conversation.session.header.utilities' (list/session) is the seat. It is
 *     session-scoped, so the runtime binds `useSession` for us and the rail can
 *     read the session's chat order directly.
 *   - The seat renders inside the session header, so it offers no full-height
 *     box; the rail chrome is fixed-positioned against the conversation
 *     scrollport, which already excludes the sidebar.
 */
window.__ModuleLoader__.load({
  id: 'dsh-conversation-outline',
  factory: (require) => {
    const React = require('react')

    const RAIL_WIDTH = 34
    const RAIL_HEIGHT = 300
    const PAGE_MAX_HEIGHT = 250
    const ROW_HEIGHT = 30
    const WRAPPER_MAX_WIDTH = 240
    const DASH_WIDTH = 8
    const DASH_HEIGHT = 2
    const INDICATOR_WIDTH = 16
    const INDICATOR_HEIGHT = 20
    const RAIL_RIGHT_GAP = 16
    const STYLE_ID = 'dsh-conversation-outline-style'
    const LOCALE_NS = 'conversation-outline'

    /** Rows the outline treats as "a question asked by the user". */
    const QUESTION_KINDS = new Set(['user', 'steering'])

    /** Localized strings for the rail. */
    const LOCALES = { zh: {}, en: {} }

    /**
     * Create a translate function bound to one locale.
     * @param {'zh' | 'en'} locale
     */
    function makeT(locale) {
      const dict = LOCALES[locale] ?? LOCALES.zh
      return (key, params) => {
        let text = dict[key] ?? key
        if (params !== undefined && params !== null) {
          for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
          }
        }
        return text
      }
    }

    /**
     * Flatten a chat node's content blocks into a single preview string.
     * @param {readonly unknown[] | undefined} content
     * @returns {string}
     */
    function extractText(content) {
      if (!Array.isArray(content)) return ''
      const parts = []
      for (const block of content) {
        if (block === null || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text)
        }
      }
      return parts.join('\n').replace(/\s+/g, ' ').trim()
    }

    /**
     * Derive the ordered question list from a chat snapshot slice.
     * @param {readonly string[] | undefined} order
     * @param {{ get(key: string): unknown } | undefined} nodes
     */
    function collectQuestions(order, nodes) {
      if (!Array.isArray(order) || nodes == null) return []
      const out = []
      for (const key of order) {
        const node = nodes.get(key)
        if (node == null) continue
        if (!QUESTION_KINDS.has(node.kind)) continue
        const data = node.data ?? {}
        out.push({
          key: node.key ?? key,
          kind: node.kind,
          text: extractText(data.content),
        })
      }
      return out
    }

    const CSS_TEXT = `
/* dsh 0.1.5 ships its own turn-navigation rail (ui-chat TurnNavigator): a
   28px-wide, vertically centred ladder sitting in the same right-hand gutter
   this rail occupies, for the same purpose. Two rails there are one too many,
   so the built-in one is suppressed while this plugin is installed. Its class
   names are build-hashed ("<hash>_frame"), so the accessible name is the only
   stable handle; railOwnerObserver() covers a renamed label. */
nav[aria-label="轮次导航"],
nav[aria-label="Turn navigation"],
nav[data-outline-suppressed="true"] {
  display: none !important;
}

[data-outline-region] {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  height: ${RAIL_HEIGHT}px;
  z-index: 1;
  pointer-events: none;
  transition: width 0.2s ease;
}

[data-outline-background] {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  width: auto;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 0;
}

[data-outline-background][data-expanded="true"] {
  opacity: 1;
}

/* DSH toggles dark mode through a body attribute, not the system preference. */
body[data-ds-dark-theme] [data-outline-background] {
  background: rgba(44, 44, 46, 0.85);
}

[data-outline-wrapper] {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  box-sizing: border-box;
  pointer-events: auto;
  transition: width 0.2s ease;
  border-radius: 16px;
  overflow: hidden;
}

[data-outline-page] {
  max-height: ${PAGE_MAX_HEIGHT}px;
  padding: 15px 0 15px 24px;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  scrollbar-width: thin;
  position: relative;
  z-index: 1;
}

[data-outline-page]::-webkit-scrollbar {
  width: 3px;
}

[data-outline-page]::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-label-tertiary, #999999);
  border-radius: 2px;
}

[data-outline-item] {
  height: ${ROW_HEIGHT}px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: inherit;
  width: 100%;
  box-sizing: border-box;
}

[data-outline-item]:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #3b82f6);
  outline-offset: -2px;
  border-radius: 4px;
}

[data-outline-title] {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-primary, #1f1f1f);
  text-align: left;
  display: none;
  min-width: 0;
}

[data-outline-wrapper][data-expanded="true"] [data-outline-title] {
  display: block;
}

[data-outline-indicator] {
  width: ${INDICATOR_WIDTH}px;
  height: ${INDICATOR_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  pointer-events: auto;
}

[data-outline-dash] {
  width: ${DASH_WIDTH}px;
  height: ${DASH_HEIGHT}px;
  border-radius: 1px;
  background: var(--dsw-alias-label-tertiary, #999999);
  flex-shrink: 0;
  transition: background 0.12s ease, transform 0.12s ease;
}

[data-outline-item]:hover [data-outline-dash],
[data-outline-item]:focus-visible [data-outline-dash] {
  background: var(--dsw-alias-label-primary, #1f1f1f);
}

[data-outline-dash][data-active="true"] {
  background: var(--dsw-alias-state-business-primary, #3b82f6);
  transform: scale(1.5);
}
`

    /**
     * Safely query a chat row by its anchor key, escaping the key for CSS.
     * Falls back to a manual scan if CSS.escape is unavailable.
     * @param {string} key
     * @param {ParentNode} [scope]
     * @returns {Element | null}
     */
    function queryRow(key, scope = document) {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        try {
          return scope.querySelector(`[data-chat-anchor-key="${CSS.escape(key)}"]`)
        } catch {
          // fall through
        }
      }
      for (const row of scope.querySelectorAll('[data-chat-anchor-key]')) {
        if (row instanceof HTMLElement && row.dataset.chatAnchorKey === key) {
          return row
        }
      }
      return null
    }

    /**
     * Suppress the built-in turn-navigation rail by shape, for the case where
     * its accessible name changes.
     *
     * The CSS rule above handles today's labels. This fallback watches the
     * transcript for a newly added `<nav>` that is absolutely positioned, no
     * wider than a rail, and living in the right gutter — the geometry no other
     * navigation matches. It only hides what it finds; layout classes stay
     * untouched.
     *
     * @returns a disposer that stops the observer.
     */
    function suppressBuiltInRail() {
      if (typeof document === 'undefined' || typeof MutationObserver !== 'function') {
        return () => {}
      }
      const isRailShaped = (node) => {
        if (!(node instanceof HTMLElement) || node.tagName !== 'NAV') return false
        const style = window.getComputedStyle(node)
        if (style.display === 'none' || style.position !== 'absolute') return false
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0 || rect.width > 40 || rect.height <= 0) return false
        return rect.left >= window.innerWidth * 0.55
      }
      const sweep = (root) => {
        if (!(root instanceof HTMLElement) && root !== document) return
        const scope = root === document ? document : root
        for (const nav of scope.querySelectorAll('nav')) {
          if (isRailShaped(nav)) nav.setAttribute('data-outline-suppressed', 'true')
        }
      }
      sweep(document)
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) sweep(node)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      return () => { observer.disconnect() }
    }

    /**
     * Return the question whose row center is nearest the 40% reading line.
     * @param {readonly {key: string, rect: {top: number, height: number}}[]} rows
     * @param {{top: number, height: number}} scroller
     * @returns {string | null}
     */
    function getReadingLineKey(rows, scroller) {
      if (!Array.isArray(rows) || scroller == null) return null
      const readingLine = scroller.top + scroller.height * 0.4
      let nearestKey = null
      let nearestDistance = Number.POSITIVE_INFINITY
      for (const row of rows) {
        const center = row.rect.top + row.rect.height / 2
        const distance = Math.abs(center - readingLine)
        if (distance < nearestDistance) {
          nearestKey = row.key
          nearestDistance = distance
        }
      }
      return nearestKey
    }

    /**
     * The rail itself: reads the session's chat snapshot and draws the
     * indicators, hover card, scroll-spy highlight, and click-to-jump behavior.
     */
    function OutlineBody(props) {
      const { order, nodes, hasMore, loadingOlder, loadOlder } = props

      const questions = React.useMemo(
        () => collectQuestions(order, nodes),
        [order, nodes],
      )

      const [activeKey, setActiveKey] = React.useState(null)
      const [expanded, setExpanded] = React.useState(false)
      const pendingScrollKey = React.useRef(null)
      const wrapperRef = React.useRef(null)

      // Scroll-spy: highlight the question nearest the 40% reading line.
      React.useEffect(() => {
        if (questions.length < 2) return undefined
        const scroller = document.querySelector('[data-conversation-scroll]')
        if (!(scroller instanceof HTMLElement)) return undefined

        let frame = null
        const updateActive = () => {
          frame = null
          const scrollerRect = scroller.getBoundingClientRect()
          const rows = questions.flatMap((question) => {
            const row = queryRow(question.key, scroller)
            return row instanceof HTMLElement
              ? [{ key: question.key, rect: row.getBoundingClientRect() }]
              : []
          })
          setActiveKey(getReadingLineKey(rows, scrollerRect))
        }
        const scheduleUpdate = () => {
          if (frame !== null) return
          if (typeof window.requestAnimationFrame === 'function') {
            frame = window.requestAnimationFrame(updateActive)
          } else {
            frame = window.setTimeout(updateActive, 0)
          }
        }

        scroller.addEventListener('scroll', scheduleUpdate, { passive: true })
        scheduleUpdate()
        return () => {
          scroller.removeEventListener('scroll', scheduleUpdate)
          if (frame !== null) {
            if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame)
            else window.clearTimeout(frame)
          }
        }
      }, [questions])

      // Finish a pending scroll after loadOlder resolves.
      React.useEffect(() => {
        const key = pendingScrollKey.current
        if (key === null) return
        if (loadingOlder) return
        const row = queryRow(key)
        if (row instanceof HTMLElement) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setActiveKey(key)
          pendingScrollKey.current = null
        } else if (hasMore && typeof loadOlder === 'function') {
          loadOlder()
        } else {
          pendingScrollKey.current = null
        }
      }, [loadingOlder, hasMore, loadOlder])

      const handleRegionEnter = React.useCallback(() => {
        setExpanded(true)
      }, [])

      const handleRegionLeave = React.useCallback((event) => {
        const related = event.relatedTarget
        if (related instanceof Node && wrapperRef.current !== null && wrapperRef.current.contains(related)) {
          return
        }
        setExpanded(false)
      }, [])

      const handleWrapperLeave = React.useCallback(() => {
        setExpanded(false)
      }, [])

      const handleWrapperBlur = React.useCallback((event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
          return
        }
        setExpanded(false)
      }, [])

      const handleActivate = React.useCallback((item) => {
        const row = queryRow(item.key)
        if (row instanceof HTMLElement) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setActiveKey(item.key)
          return
        }
        if (hasMore && !loadingOlder && typeof loadOlder === 'function') {
          pendingScrollKey.current = item.key
          loadOlder()
        }
      }, [hasMore, loadingOlder, loadOlder])

      const handleKeyDown = React.useCallback((event, item) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleActivate(item)
        }
      }, [handleActivate])

      const expandedWidth = questions.length > 8
        ? WRAPPER_MAX_WIDTH + 'px'
        : 'fit-content'

      const regionStyle = {
        width: RAIL_WIDTH + 'px',
        right: 0,
        maxWidth: WRAPPER_MAX_WIDTH + 'px',
      }

      const wrapperStyle = {
        width: expanded ? expandedWidth : RAIL_WIDTH + 'px',
        maxWidth: WRAPPER_MAX_WIDTH + 'px',
        pointerEvents: 'auto',
      }

      const pageStyle = {
        maxHeight: PAGE_MAX_HEIGHT + 'px',
        overflowY: expanded ? 'auto' : 'hidden',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
      }

      const dashStyle = { width: DASH_WIDTH + 'px', height: DASH_HEIGHT + 'px' }
      const indicatorStyle = { width: INDICATOR_WIDTH + 'px', height: INDICATOR_HEIGHT + 'px' }

      // Hide entirely when fewer than 2 questions.
      if (questions.length < 2) return null

      return React.createElement(
        'div',
        {
          'data-testid': 'outline-region',
          'data-outline-region': true,
          style: regionStyle,
          onMouseEnter: handleRegionEnter,
          onMouseLeave: handleRegionLeave,
          onFocus: handleRegionEnter,
          onBlur: handleRegionLeave,
        },
        React.createElement(
          'div',
          {
            ref: wrapperRef,
            'data-testid': 'outline-wrapper',
            'data-outline-wrapper': true,
            'data-expanded': expanded ? 'true' : undefined,
            style: wrapperStyle,
            onMouseLeave: handleWrapperLeave,
            onBlur: handleWrapperBlur,
          },
          React.createElement('div', { 'data-outline-background': true, 'data-expanded': expanded ? 'true' : undefined }),
          React.createElement(
            'div',
            {
              'data-testid': 'outline-page',
              'data-outline-page': true,
              style: pageStyle,
            },
            questions.map((item) => {
              const isActive = activeKey === item.key
              return React.createElement(
                'button',
                {
                  key: item.key,
                  type: 'button',
                  'data-testid': 'outline-item',
                  'data-outline-item': true,
                  'data-key': item.key,
                  'data-active': isActive ? 'true' : 'false',
                  title: item.text,
                  style: { height: ROW_HEIGHT + 'px' },
                  onClick: () => handleActivate(item),
                  onKeyDown: (e) => handleKeyDown(e, item),
                },
                React.createElement(
                  'span',
                  { 'data-testid': 'outline-title', 'data-outline-title': true },
                  item.text,
                ),
                React.createElement(
                  'span',
                  {
                    'data-testid': 'outline-indicator',
                    'data-outline-indicator': true,
                    style: indicatorStyle,
                  },
                  React.createElement('span', {
                    'data-testid': 'outline-dash',
                    'data-outline-dash': true,
                    'data-active': isActive ? 'true' : 'false',
                    'data-kind': item.kind,
                    style: dashStyle,
                  }),
                ),
              )
            }),
          ),
        ),
      )
    }

    /**
     * Occupant of the session-scoped 'conversation.session.header.utilities'
     * seat: the fixed-position chrome wrapper plus the rail itself.
     *
     * The seat is a utility row in the session header, so it offers no
     * full-height box to hang a rail on; the wrapper is fixed-positioned
     * against the conversation scrollport instead, which already excludes the
     * sidebar. Because the seat is session-scoped, the rail reads the session
     * store directly — the pre-0.1.5 build had to bridge into session scope from
     * the root-scope 'shell.overlay' seat through an injected SessionProvider,
     * and that bridge no longer yields a session binding.
     *
     * @param props - the seat's standard session props plus the injected loadOlder.
     */
    function OutlineRail(props) {
      const { useChat, useSession, loadOlder } = props
      const hostRef = React.useRef(null)
      const [right, setRight] = React.useState(null)

      // 0.1.5 moved the chat projection out of the session snapshot and into the
      // `chat` hook ui-chat provides on the session scope; `useSession` carries
      // only session lifecycle state now, and still owns pagination.
      const snapshot = useChat((s) => s)
      const order = snapshot ? snapshot.order : undefined
      const nodes = snapshot ? snapshot.nodes : undefined
      const hasMore = useSession((s) => s && s.hasMore)
      const loadingOlder = useSession((s) => s && s.loadingOlder)

      React.useLayoutEffect(() => {
        const measure = () => {
          const scroller = document.querySelector('[data-conversation-scroll]')
          if (!(scroller instanceof HTMLElement)) return
          const rect = scroller.getBoundingClientRect()
          setRight(Math.max(0, Math.round(window.innerWidth - rect.right)))
        }
        measure()
        window.addEventListener('resize', measure)
        const scroller = document.querySelector('[data-conversation-scroll]')
        let observer = null
        if (scroller instanceof HTMLElement && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(measure)
          observer.observe(scroller)
        }
        return () => {
          window.removeEventListener('resize', measure)
          if (observer !== null) observer.disconnect()
        }
      }, [])

      const body = React.createElement(OutlineBody, { order, nodes, hasMore, loadingOlder, loadOlder })

      // Until the conversation viewport is measurable there is nowhere to draw.
      if (right === null) return null
      return React.createElement(
        'div',
        {
          ref: hostRef,
          'data-outline-host': true,
          style: {
            position: 'fixed',
            top: 0,
            bottom: 0,
            right: `${right + RAIL_RIGHT_GAP}px`,
            width: `${RAIL_WIDTH}px`,
            pointerEvents: 'none',
            zIndex: 5,
          },
        },
        body,
      )
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply(ctx) {
        const localeDisposer = ctx.locale.register(LOCALE_NS, LOCALES)

        let style = null
        if (typeof document !== 'undefined') {
          style = document.createElement('style')
          style.id = STYLE_ID
          style.dataset.plugin = 'dsh-conversation-outline'
          style.textContent = CSS_TEXT
          document.head.append(style)
        }

        // The built-in turn-navigation rail shares this gutter; suppress it
        // while this rail owns the space.
        const restoreBuiltInRail = suppressBuiltInRail()

        ctx.effect(() => () => {
          restoreBuiltInRail()
          localeDisposer()
          if (style !== null) {
            style.remove()
            style = null
          }
        }, 'conversation-outline: cleanup')

        // Session-scoped seat: the rail reads the chat projection through the
        // `useChat` hook and the pagination flags through `useSession`, both
        // bound by the framework for this scope.
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'conversation-outline',
          order: 40,
          locale: LOCALE_NS,
          inject: (sessionId) => ({
            loadOlder: () => {
              const scoped = ctx.sessions.scope(sessionId)
              if (typeof scoped?.loadOlder === 'function') {
                void scoped.loadOlder()
              }
            },
          }),
        }, OutlineRail))
      },
      // Exposed for unit tests; the runtime never reads these.
       __test__: { extractText, collectQuestions, getReadingLineKey, OutlineBody, OutlineRail, suppressBuiltInRail, RAIL_WIDTH, RAIL_HEIGHT, PAGE_MAX_HEIGHT, ROW_HEIGHT, WRAPPER_MAX_WIDTH, DASH_WIDTH, DASH_HEIGHT, INDICATOR_WIDTH, INDICATOR_HEIGHT, RAIL_RIGHT_GAP, LOCALES, makeT, CSS_TEXT },
    }
  },
})
