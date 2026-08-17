// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { loadPlugin, makeUseSession, makeT } from './harness.js'

const plugin = loadPlugin()
const {
  OutlineBody, OutlineHost,
  RAIL_WIDTH, RAIL_HEIGHT, PAGE_MAX_HEIGHT, ROW_HEIGHT,
  WRAPPER_MAX_WIDTH, DASH_WIDTH, DASH_HEIGHT,
  INDICATOR_WIDTH, INDICATOR_HEIGHT,
  RAIL_RIGHT_GAP,
  getReadingLineKey,
} = plugin.__test__

let observers

beforeEach(() => {
  observers = []
  class MockIntersectionObserver {
    constructor(callback) {
      this.callback = callback
      this.observed = []
      observers.push(this)
    }
    observe(el) { this.observed.push(el) }
    unobserve(el) { this.observed = this.observed.filter(e => e !== el) }
    disconnect() { this.observed = [] }
    trigger(entries) { this.callback(entries, this) }
  }
  global.IntersectionObserver = MockIntersectionObserver
})

afterEach(() => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  if (scroller) scroller.remove()
  global.IntersectionObserver = undefined
  observers = []
})

function createScrollerWithRows(keys) {
  const existing = document.querySelector('[data-conversation-scroll]')
  if (existing) existing.remove()
  const scroller = document.createElement('div')
  scroller.dataset.conversationScroll = ''
  scroller.style.height = '400px'
  scroller.style.overflow = 'auto'
  for (const key of keys) {
    const row = document.createElement('div')
    row.dataset.chatAnchorKey = key
    row.style.height = '200px'
    scroller.appendChild(row)
  }
  document.body.appendChild(scroller)
  return scroller
}

function renderBody(questions, options = {}) {
  const useSession = makeUseSession(questions, options)
  return render(React.createElement(OutlineBody, {
    sessionId: 's1',
    useSession,
    t: makeT(options.locale ?? 'zh'),
    loadOlder: options.loadOlder ?? vi.fn(),
  }))
}

describe('reference constants', () => {
  test('rail is 34px wide', () => { expect(RAIL_WIDTH).toBe(34) })
  test('rail is 300px tall', () => { expect(RAIL_HEIGHT).toBe(300) })
  test('page max-height is 250px', () => { expect(PAGE_MAX_HEIGHT).toBe(250) })
  test('page clips horizontal overflow from the reference left padding', () => {
    renderBody([{ key: 'u1', text: 'A' }, { key: 'u2', text: 'B' }])
    expect(screen.getByTestId('outline-page').style.overflowX).toBe('hidden')
  })
  test('row height is 30px', () => { expect(ROW_HEIGHT).toBe(30) })
  test('wrapper max width is 240px', () => { expect(WRAPPER_MAX_WIDTH).toBe(240) })
  test('dash is 8px wide', () => { expect(DASH_WIDTH).toBe(8) })
  test('dash is 2px tall', () => { expect(DASH_HEIGHT).toBe(2) })
  test('indicator slot is 16px wide', () => { expect(INDICATOR_WIDTH).toBe(16) })
  test('indicator slot is 20px tall', () => { expect(INDICATOR_HEIGHT).toBe(20) })
  test('rail keeps a scrollbar-width gap from the viewport right edge', () => { expect(RAIL_RIGHT_GAP).toBe(16) })
})

describe('visibility gate', () => {
  test('renders nothing when 0 questions', () => {
    renderBody([])
    expect(screen.queryByTestId('outline-region')).toBeNull()
  })

  test('renders nothing when 1 question', () => {
    renderBody([{ key: 'u1', text: 'Hello' }])
    expect(screen.queryByTestId('outline-region')).toBeNull()
  })

  test('renders region when 2 questions', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    expect(screen.getByTestId('outline-region')).toBeTruthy()
  })

  test('transitions 1 question to 2 without hook order error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = renderBody([{ key: 'u1', text: 'Hello' }])
    expect(screen.queryByTestId('outline-region')).toBeNull()

    view.rerender(
      React.createElement(OutlineBody, {
        sessionId: 's1',
        useSession: makeUseSession([
          { key: 'u1', text: 'Hello' },
          { key: 'u2', text: 'World' },
        ]),
        t: makeT('zh'),
        loadOlder: vi.fn(),
      }),
    )

    expect(screen.getByTestId('outline-region')).toBeTruthy()
    expect(screen.getAllByTestId('outline-item')).toHaveLength(2)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

describe('DOM structure', () => {
  test('region contains background and wrapper', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const region = screen.getByTestId('outline-region')
    expect(region.querySelector('[data-outline-background]')).not.toBeNull()
    expect(region.querySelector('[data-outline-wrapper]')).not.toBeNull()
  })

  test('wrapper contains page with correct number of items', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const wrapper = screen.getByTestId('outline-wrapper')
    const page = wrapper.querySelector('[data-outline-page]')
    expect(page).not.toBeNull()
    expect(page.querySelectorAll('[data-outline-item]')).toHaveLength(2)
  })

  test('each item is a button with title span and indicator containing dash', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const items = screen.getAllByTestId('outline-item')
    for (const item of items) {
      expect(item.tagName).toBe('BUTTON')
      expect(item.querySelector('[data-outline-title]')).not.toBeNull()
      const indicator = item.querySelector('[data-outline-indicator]')
      expect(indicator).not.toBeNull()
      expect(indicator.querySelector('[data-outline-dash]')).not.toBeNull()
    }
  })

  test('each item has native title attribute with full user text', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const items = screen.getAllByTestId('outline-item')
    expect(items[0].getAttribute('title')).toBe('Hello')
    expect(items[1].getAttribute('title')).toBe('World')
  })
})

describe('collapsed and expanded state', () => {
  test('wrapper is not expanded by default', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const wrapper = screen.getByTestId('outline-wrapper')
    expect(wrapper).not.toHaveAttribute('data-expanded', 'true')
  })

  test('background is a descendant of wrapper, not a sibling', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const wrapper = screen.getByTestId('outline-wrapper')
    const bg = wrapper.querySelector('[data-outline-background]')
    expect(bg).not.toBeNull()
    expect(wrapper.contains(bg)).toBe(true)
  })

  test('expanded background is inside wrapper and fills it', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    await user.hover(screen.getByTestId('outline-region'))
    const wrapper = screen.getByTestId('outline-wrapper')
    const bg = wrapper.querySelector('[data-outline-background]')
    expect(bg).not.toBeNull()
    // Background should be the first child of wrapper
    expect(wrapper.firstElementChild).toBe(bg)
    // Background should have data-expanded matching wrapper
    expect(bg.getAttribute('data-expanded')).toBe(wrapper.getAttribute('data-expanded'))
  })

  test('wrapper has pointer-events auto when collapsed (34px hit region)', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    expect(screen.getByTestId('outline-wrapper').style.pointerEvents).toBe('auto')
  })

  test('hover on region expands wrapper', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    await user.hover(screen.getByTestId('outline-region'))
    expect(screen.getByTestId('outline-wrapper')).toHaveAttribute('data-expanded', 'true')
  })

  test('focus on an item expands wrapper', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const items = screen.getAllByTestId('outline-item')
    act(() => { items[0].focus() })
    expect(screen.getByTestId('outline-wrapper')).toHaveAttribute('data-expanded', 'true')
  })

  test('mouse leave collapses wrapper', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const region = screen.getByTestId('outline-region')
    await user.hover(region)
    expect(screen.getByTestId('outline-wrapper')).toHaveAttribute('data-expanded', 'true')
    await user.unhover(region)
    await waitFor(() => {
      expect(screen.getByTestId('outline-wrapper')).not.toHaveAttribute('data-expanded', 'true')
    })
  })

  test('collapsed background is transparent (no data-expanded true)', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const bg = screen.getByTestId('outline-region').querySelector('[data-outline-background]')
    expect(bg).not.toBeNull()
    expect(bg).not.toHaveAttribute('data-expanded', 'true')
  })

  test('expanded background becomes visible (data-expanded true)', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    await user.hover(screen.getByTestId('outline-region'))
    const bg = screen.getByTestId('outline-region').querySelector('[data-outline-background]')
    expect(bg).toHaveAttribute('data-expanded', 'true')
  })

  test('background collapses with wrapper on mouse leave', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const region = screen.getByTestId('outline-region')
    await user.hover(region)
    const bg = region.querySelector('[data-outline-background]')
    expect(bg).toHaveAttribute('data-expanded', 'true')
    await user.unhover(region)
    await waitFor(() => {
      expect(bg).not.toHaveAttribute('data-expanded', 'true')
    })
  })
})

describe('wrapper width', () => {
  test('fit-content for <=8 items when expanded', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'A' }, { key: 'u2', text: 'B' },
      { key: 'u3', text: 'C' }, { key: 'u4', text: 'D' },
    ])
    await user.hover(screen.getByTestId('outline-region'))
    expect(screen.getByTestId('outline-wrapper').style.width).toBe('fit-content')
  })

  test('240px for >8 items when expanded', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 9 }, (_, i) => ({ key: `u${i}`, text: `Q${i}` }))
    renderBody(rows)
    await user.hover(screen.getByTestId('outline-region'))
    expect(screen.getByTestId('outline-wrapper').style.width).toBe(`${WRAPPER_MAX_WIDTH}px`)
  })
})

describe('region geometry contract', () => {
  test('region keeps fixed rail width and right anchor when expanded with <=8 items', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'A' }, { key: 'u2', text: 'B' },
      { key: 'u3', text: 'C' }, { key: 'u4', text: 'D' },
    ])
    const region = screen.getByTestId('outline-region')
    // Collapsed: fixed rail width, right-anchored.
    expect(region.style.width).toBe(`${RAIL_WIDTH}px`)
    expect(region.style.right).toBe('0px')
    // Expanded with <=8 items: region must NOT collapse to 'fit-content'.
    await user.hover(region)
    expect(region.style.width).toBe(`${RAIL_WIDTH}px`)
    expect(region.style.right).toBe('0px')
  })

  test('region keeps fixed rail width and right anchor when expanded with >8 items', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 9 }, (_, i) => ({ key: `u${i}`, text: `Q${i}` }))
    renderBody(rows)
    const region = screen.getByTestId('outline-region')
    expect(region.style.width).toBe(`${RAIL_WIDTH}px`)
    expect(region.style.right).toBe('0px')
    await user.hover(region)
    expect(region.style.width).toBe(`${RAIL_WIDTH}px`)
    expect(region.style.right).toBe('0px')
  })
})

describe('page layout', () => {
  test('page has max-height 250px', () => {
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    expect(screen.getByTestId('outline-page').style.maxHeight).toBe(`${PAGE_MAX_HEIGHT}px`)
  })

  test('page overflow hidden when collapsed, auto when expanded', async () => {
    const user = userEvent.setup()
    renderBody([
      { key: 'u1', text: 'Hello' },
      { key: 'u2', text: 'World' },
    ])
    const page = screen.getByTestId('outline-page')
    expect(page.style.overflowY).toBe('hidden')
    await user.hover(screen.getByTestId('outline-region'))
    expect(page.style.overflowY).toBe('auto')
  })
})

describe('active state and scroll-spy', () => {
  test('reading line selects the nearest row, not the first visible question', () => {
    const scroller = { top: 100, height: 500 }
    const rows = [
      { key: 'u1', rect: { top: 120, height: 40 } },
      { key: 'u2', rect: { top: 250, height: 40 } },
      { key: 'u3', rect: { top: 285, height: 40 } },
    ]

    expect(getReadingLineKey(rows, scroller)).toBe('u3')
  })

  test('active item follows the 40% reading line on scroll', async () => {
    const scroller = createScrollerWithRows(['u1', 'u2', 'u3'])
    scroller.getBoundingClientRect = () => ({ top: 100, height: 500 })
    const rows = [...scroller.querySelectorAll('[data-chat-anchor-key]')]
    rows[0].getBoundingClientRect = () => ({ top: 120, height: 40 })
    rows[1].getBoundingClientRect = () => ({ top: 250, height: 40 })
    rows[2].getBoundingClientRect = () => ({ top: 285, height: 40 })
    renderBody([
      { key: 'u1', text: 'First' },
      { key: 'u2', text: 'Second' },
      { key: 'u3', text: 'Third' },
    ])
    await act(async () => { scroller.dispatchEvent(new Event('scroll')) })
    const items = screen.getAllByTestId('outline-item')
    await waitFor(() => { expect(items[2]).toHaveAttribute('data-active', 'true') })
    expect(items[0]).not.toHaveAttribute('data-active', 'true')
  })

  test('active dash carries data-active true', async () => {
    createScrollerWithRows(['u1', 'u2'])
    const scroller = document.querySelector('[data-conversation-scroll]')
    scroller.getBoundingClientRect = () => ({ top: 0, height: 100 })
    const rows = [...scroller.querySelectorAll('[data-chat-anchor-key]')]
    rows[0].getBoundingClientRect = () => ({ top: 0, height: 20 })
    rows[1].getBoundingClientRect = () => ({ top: 40, height: 20 })
    renderBody([
      { key: 'u1', text: 'First' },
      { key: 'u2', text: 'Second' },
    ])
    await act(async () => { scroller.dispatchEvent(new Event('scroll')) })
    const dashes = screen.getAllByTestId('outline-dash')
    await waitFor(() => { expect(dashes[1]).toHaveAttribute('data-active', 'true') })
    expect(dashes[0]).not.toHaveAttribute('data-active', 'true')
  })

  test('only user and steering kinds produce items', () => {
    renderBody([
      { key: 'u1', text: 'User 1' },
      { key: 't1', kind: 'tool-call', text: 'Tool result' },
      { key: 'u2', kind: 'steering', text: 'Steering' },
      { key: 'c1', kind: 'context', text: 'Injected context' },
    ])
    expect(screen.getAllByTestId('outline-item')).toHaveLength(2)
  })
})

describe('navigation', () => {
  test('click on item scrolls to chat row', () => {
    createScrollerWithRows(['u1', 'u2'])
    const row = document.querySelector('[data-chat-anchor-key="u1"]')
    const scrollIntoViewMock = vi.fn()
    row.scrollIntoView = scrollIntoViewMock
    renderBody([
      { key: 'u1', text: 'First' },
      { key: 'u2', text: 'Second' },
    ])
    act(() => { screen.getAllByTestId('outline-item')[0].click() })
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  test('Enter key on item activates navigation', () => {
    createScrollerWithRows(['u1', 'u2'])
    const row = document.querySelector('[data-chat-anchor-key="u1"]')
    const scrollIntoViewMock = vi.fn()
    row.scrollIntoView = scrollIntoViewMock
    renderBody([
      { key: 'u1', text: 'First' },
      { key: 'u2', text: 'Second' },
    ])
    act(() => {
      screen.getAllByTestId('outline-item')[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    })
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  test('Space key on item activates navigation', () => {
    createScrollerWithRows(['u1', 'u2'])
    const row = document.querySelector('[data-chat-anchor-key="u1"]')
    const scrollIntoViewMock = vi.fn()
    row.scrollIntoView = scrollIntoViewMock
    renderBody([
      { key: 'u1', text: 'First' },
      { key: 'u2', text: 'Second' },
    ])
    act(() => {
      screen.getAllByTestId('outline-item')[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      )
    })
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  test('click calls loadOlder when row missing and hasMore', () => {
    const loadOlder = vi.fn()
    renderBody(
      [{ key: 'u1', text: 'A' }, { key: 'u2', text: 'B' }],
      { hasMore: true, loadOlder },
    )
    act(() => { screen.getAllByTestId('outline-item')[0].click() })
    expect(loadOlder).toHaveBeenCalled()
  })
})

describe('title content', () => {
  test('title text matches user message text', () => {
    renderBody([
      { key: 'u1', text: 'Hello world' },
      { key: 'u2', text: 'Goodbye world' },
    ])
    const titles = screen.getAllByTestId('outline-title')
    expect(titles[0]).toHaveTextContent('Hello world')
    expect(titles[1]).toHaveTextContent('Goodbye world')
  })

  test('no sequence count labels in DOM', () => {
    renderBody([
      { key: 'u1', text: 'Hello', seq: 1 },
      { key: 'u2', text: 'World', seq: 2 },
    ])
    const region = screen.getByTestId('outline-region')
    expect(region.textContent).not.toContain('提问 1')
    expect(region.textContent).not.toContain('提问 2')
    expect(region.textContent).not.toContain('Question 1')
  })

  test('no relative time labels in DOM', () => {
    const now = Date.now()
    renderBody([
      { key: 'u1', text: 'Hello', time: now },
      { key: 'u2', text: 'World', time: now },
    ])
    const region = screen.getByTestId('outline-region')
    expect(region.textContent).not.toContain('刚刚')
    expect(region.textContent).not.toContain('分钟前')
    expect(region.textContent).not.toContain('just now')
  })
})

describe('CSS geometry contract', () => {
  const { CSS_TEXT } = plugin.__test__

  /**
   * Extract the first rule block body for a given selector from CSS_TEXT.
   * @param {string} selector
   * @returns {string}
   */
  function ruleBlock(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`)
    const m = CSS_TEXT.match(re)
    return m ? m[1] : ''
  }

  test('wrapper is content-centered vertically, not stretched top-to-bottom', () => {
    const block = ruleBlock('[data-outline-wrapper]')
    expect(block).not.toMatch(/top:\s*0[^.]/)
    expect(block).not.toMatch(/bottom:\s*0/)
    expect(block).toMatch(/top:\s*50%/)
    expect(block).toMatch(/translateY\(-50%\)/)
  })

  test('wrapper has rounded clipping for background containment', () => {
    const block = ruleBlock('[data-outline-wrapper]')
    expect(block).toMatch(/border-radius:\s*16px/)
    expect(block).toMatch(/overflow:\s*hidden/)
  })

  test('page does not force full wrapper height', () => {
    const block = ruleBlock('[data-outline-page]')
    expect(block).not.toMatch(/height:\s*100%/)
  })

  test('background fills wrapper exactly, not inset by 4px', () => {
    const block = ruleBlock('[data-outline-background]')
    expect(block).toMatch(/top:\s*0\s*;/)
    expect(block).toMatch(/bottom:\s*0\s*;/)
    expect(block).not.toMatch(/top:\s*4px/)
    expect(block).not.toMatch(/bottom:\s*4px/)
  })
})

describe('host', () => {
  test('host has pointer-events none', () => {
    function SessionProvider({ children }) { return children() }
    render(React.createElement(OutlineHost, {
      SessionProvider,
      renderSlot: () => React.createElement('div', { 'data-outline-region': true }),
    }))
    expect(document.querySelector('[data-outline-host]').style.pointerEvents).toBe('none')
  })

  test('host width matches rail width', () => {
    function SessionProvider({ children }) { return children() }
    render(React.createElement(OutlineHost, {
      SessionProvider,
      renderSlot: () => React.createElement('div', { 'data-outline-region': true }),
    }))
    expect(document.querySelector('[data-outline-host]')).toHaveStyle({ width: `${RAIL_WIDTH}px` })
  })
})
