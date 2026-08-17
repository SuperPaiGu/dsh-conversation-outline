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
 *   - 'shell.overlay' (list/root) is the frame-wide floating layer.
 *   - Our overlay entry declares a private session-scope child seat,
 *     'outline.body', so the framework hands us SessionProvider as a prop
 *     and the child occupant receives sessionId + useSession.
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
     * Parse the third track width from a CSS grid-template-columns value.
     * Expected input: "260px minmax(0, 1fr) 0px" -> 0.
     * @param {string} value
     * @returns {number}
     */
    function parseDetailsWidth(value) {
      if (typeof value !== 'string') return 0
      const tracks = value.trim().split(/\s+/)
      const third = tracks[2]
      if (third === undefined) return 0
      const match = third.match(/^(\d+(?:\.\d+)?)px$/)
      return match !== null ? Number.parseFloat(match[1]) : 0
    }

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
     * Session-scope occupant of the private 'outline.body' seat.
     */
    function OutlineBody(props) {
      const { useSession, loadOlder } = props

      const order = useSession((s) => s.chat.order)
      const nodes = useSession((s) => s.chat.nodes)
      const hasMore = useSession((s) => s.hasMore)
      const loadingOlder = useSession((s) => s.loadingOlder)

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
     * Root-scope occupant of 'shell.overlay'. Owns the floating chrome,
     * responsive positioning, and bridges into session scope through the
     * injected SessionProvider.
     */
    function OutlineHost(props) {
      const { SessionProvider, renderSlot } = props
      const hostRef = React.useRef(null)
      const [right, setRight] = React.useState(0)

      React.useLayoutEffect(() => {
        const host = hostRef.current
        if (host === null) return undefined
        const frame = host.closest('[data-shell-overlay]')?.parentElement
        if (!(frame instanceof HTMLElement)) return undefined

        const observer = new ResizeObserver(() => {
          const columns = window.getComputedStyle(frame).gridTemplateColumns
          setRight(parseDetailsWidth(columns))
        })
        observer.observe(frame)
        setRight(parseDetailsWidth(window.getComputedStyle(frame).gridTemplateColumns))

        return () => observer.disconnect()
      }, [])

      if (typeof SessionProvider !== 'function') return null
      return React.createElement(
        'div',
        {
          ref: hostRef,
          'data-outline-host': true,
          style: { position: 'absolute', top: 0, bottom: 0, right: `${right + RAIL_RIGHT_GAP}px`, width: `${RAIL_WIDTH}px`, pointerEvents: 'none' },
        },
        React.createElement(
          SessionProvider,
          { empty: null },
          () => renderSlot('outline.body', {}),
        ),
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

        ctx.effect(() => () => {
          localeDisposer()
          if (style !== null) {
            style.remove()
            style = null
          }
        }, 'conversation-outline: cleanup')

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'conversation-outline',
          children: {
            'outline.body': { kind: 'single', scope: 'session' },
          },
        }, OutlineHost))

        ctx.slots.inject('outline.body', () => ctx.slots.register({
          name: 'outline.body',
          locale: LOCALE_NS,
          inject: (sessionId) => ({
            loadOlder: () => {
              const scoped = ctx.sessions.scope(sessionId)
              if (typeof scoped?.loadOlder === 'function') {
                void scoped.loadOlder()
              }
            },
          }),
        }, OutlineBody))
      },
      // Exposed for unit tests; the runtime never reads these.
       __test__: { extractText, collectQuestions, getReadingLineKey, OutlineBody, OutlineHost, RAIL_WIDTH, RAIL_HEIGHT, PAGE_MAX_HEIGHT, ROW_HEIGHT, WRAPPER_MAX_WIDTH, DASH_WIDTH, DASH_HEIGHT, INDICATOR_WIDTH, INDICATOR_HEIGHT, RAIL_RIGHT_GAP, LOCALES, makeT, CSS_TEXT },
    }
  },
})
