import { test, expect } from '@playwright/test'

const BASE = 'http://127.0.0.1:3080'

const REGION = '[data-testid="outline-region"]'
const WRAPPER = '[data-testid="outline-wrapper"]'
const PAGE = '[data-testid="outline-page"]'
const ITEM = '[data-testid="outline-item"]'
const TITLE = '[data-testid="outline-title"]'
const DASH = '[data-testid="outline-dash"]'
const BG = '[data-outline-background]'

/** Turn-level busy text shown by the always-mounted status element while a turn runs. */
const BUSY_STATUS = /运行中|Deep diving\.\.\./i
/** Queue-dock count text shown while messages wait behind a running turn. */
const QUEUE_TEXT = /排队消息|queued messages/i

async function waitForStableRail(page) {
  // Wait for the host to appear; the region may or may not be rendered depending on question count.
  await page.waitForSelector('[data-outline-host]', { state: 'attached', timeout: 10000 })
}

/**
 * Snapshot the agent lifecycle from the live DOM: whether a turn-level busy
 * status or a queued-message dock is currently visible. The status element
 * stays mounted (and visible) even when idle, so only its text content is a
 * reliable signal.
 * @param {import('@playwright/test').Page} page
 */
async function readTurnState(page) {
  return page.evaluate(() => {
    const statuses = [...document.querySelectorAll('[role="status"]')]
    const busy = statuses.some(el => /运行中|Deep diving\.\.\./i.test(el.textContent ?? ''))
    const dock = document.querySelector('[data-queue-dock]')
    const queued = dock !== null && /排队消息|queued messages/i.test(dock.textContent ?? '')
    return { busy, queued }
  })
}

/**
 * Observe a turn actually starting after a submit: busy status text or queued
 * messages. Bounded and optional — a very fast turn may start and settle
 * between polls, in which case the subsequent idle poll decides the outcome.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout]
 */
async function waitForTurnStart(page, timeout = 30000) {
  try {
    await expect.poll(async () => {
      const state = await readTurnState(page)
      return state.busy || state.queued
    }, { timeout }).toBe(true)
  } catch (error) {
    if (!/timeout/i.test(String(error))) throw error
    // Optional start window: a fast turn can start and finish between polls.
  }
}

/**
 * Wait until no agent turn is running and nothing is queued — the previous
 * message has fully completed before the next one is sent.
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout]
 */
async function waitForTurnIdle(page, timeout = 120000) {
  await expect.poll(async () => {
    const state = await readTurnState(page)
    return !state.busy && !state.queued
  }, { timeout }).toBe(true)
}

async function sendMessage(page, text) {
  // The previous turn (if any) must fully finish before the next message.
  await waitForTurnIdle(page, 120000)
  const input = page.locator('[data-composer-card] [contenteditable="true"], [data-composer-card] textarea, [data-composer-seat] textarea').first()
  await input.waitFor({ state: 'visible', timeout: 10000 })
  await input.fill(text)
  await input.press('Enter')
  // The message is admitted as a chat row...
  await page.locator('[data-chat-anchor-key]').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 30000 })
  // ...a turn starts...
  await waitForTurnStart(page)
  // ...and completes before we return.
  await waitForTurnIdle(page, 120000)
}

async function newSession(page) {
  const btn = page.getByRole('button', { name: /New session|New Session|新建会话/i }).first()
  await btn.waitFor({ state: 'visible', timeout: 10000 })
  await btn.click()
}

async function switchLocale(page, targetLabel) {
  const settingsBtn = page.getByRole('button', { name: /Settings|设置/ }).first()
  await settingsBtn.waitFor({ state: 'visible', timeout: 10000 })
  await settingsBtn.click()
  const languageBtn = page.locator('button:has-text("中文"), button:has-text("English")').first()
  await languageBtn.waitFor({ state: 'visible', timeout: 10000 })
  await languageBtn.click()
  await page.getByRole('menuitem', { name: targetLabel }).first().click()
  await page.locator('button:has-text("关闭"), button:has-text("Close")').first().click()
}

/**
 * Measure the reference-style geometry:
 * region height, vertical centering, wrapper expansion, page scroll box.
 * @param {import('@playwright/test').Page} page
 */
async function referenceGeometry(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-outline-host]')
    const region = document.querySelector('[data-outline-region]')
    const wrapper = document.querySelector('[data-outline-wrapper]')
    const pageEl = document.querySelector('[data-outline-page]')
    if (!host || !region || !wrapper || !pageEl) return null
    const hostRect = host.getBoundingClientRect()
    const regionRect = region.getBoundingClientRect()
    const wrapperStyle = getComputedStyle(wrapper)
    const pageStyle = getComputedStyle(pageEl)
    return {
      regionHeight: regionRect.height,
      regionCenterOffset: Math.abs(regionRect.top + regionRect.height / 2 - (hostRect.top + hostRect.height / 2)),
      wrapperPointerEvents: wrapperStyle.pointerEvents,
      pageMaxHeight: pageStyle.maxHeight,
      pageOverflowY: pageStyle.overflowY,
      pagePaddingTop: pageStyle.paddingTop,
      pagePaddingLeft: pageStyle.paddingLeft,
      hostRight: hostRect.right,
      viewportWidth: window.innerWidth,
    }
  })
}

/**
 * Measure the host and expanded-wrapper right edges so the wrapper can be
 * proven to stay anchored to the host's right edge when it expands leftward.
 * @param {import('@playwright/test').Page} page
 */
async function rightEdges(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-outline-host]')
    const wrapper = document.querySelector('[data-outline-wrapper]')
    if (!host || !wrapper) return null
    return {
      hostRight: host.getBoundingClientRect().right,
      wrapperRight: wrapper.getBoundingClientRect().right,
    }
  })
}

/**
 * Measure the expanded background and wrapper rects to prove the background
 * fills the wrapper (same left/right within 2px) and is a descendant of it.
 * @param {import('@playwright/test').Page} page
 */
async function backgroundWrapperAlignment(page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector('[data-outline-wrapper]')
    const bg = wrapper?.querySelector('[data-outline-background]')
    if (!wrapper || !bg) return null
    const wrapperRect = wrapper.getBoundingClientRect()
    const bgRect = bg.getBoundingClientRect()
    return {
      bgIsDescendant: wrapper.contains(bg),
      leftDiff: Math.abs(wrapperRect.left - bgRect.left),
      rightDiff: Math.abs(wrapperRect.right - bgRect.right),
      topDiff: Math.abs(wrapperRect.top - bgRect.top),
      bottomDiff: Math.abs(wrapperRect.bottom - bgRect.bottom),
    }
  })
}

/**
 * Measure wrapper height and vertical centering relative to the region
 * for a short (<=2 item) session where content is smaller than max height.
 * @param {import('@playwright/test').Page} page
 */
async function wrapperCenterGeometry(page) {
  return page.evaluate(() => {
    const region = document.querySelector('[data-outline-region]')
    const wrapper = document.querySelector('[data-outline-wrapper]')
    if (!region || !wrapper) return null
    const regionRect = region.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const regionCenter = regionRect.top + regionRect.height / 2
    const wrapperCenter = wrapperRect.top + wrapperRect.height / 2
    return {
      wrapperHeight: wrapperRect.height,
      wrapperCenterOffset: Math.abs(wrapperCenter - regionCenter),
    }
  })
}

/** Return the user-message key nearest the reference 40% reading line. */
async function readingLineKey(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (!(scroller instanceof HTMLElement)) return null
    const scrollerRect = scroller.getBoundingClientRect()
    const readingLine = scrollerRect.top + scrollerRect.height * 0.4
    const keys = new Set([...document.querySelectorAll('[data-testid="outline-item"]')]
      .map(item => item.getAttribute('data-key')))
    let nearestKey = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const row of document.querySelectorAll('[data-chat-anchor-key]')) {
      const key = row.getAttribute('data-chat-anchor-key')
      if (key === null || !keys.has(key)) continue
      const rect = row.getBoundingClientRect()
      const distance = Math.abs(rect.top + rect.height / 2 - readingLine)
      if (distance < nearestDistance) {
        nearestKey = key
        nearestDistance = distance
      }
    }
    return nearestKey
  })
}

test.describe('dsh-conversation-outline reference rail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE)
    await waitForStableRail(page)
  })

  test('hidden when fewer than 2 questions', async ({ page }) => {
    const region = page.locator(REGION)
    // Ensure we have <2 questions: create a new session or verify current state.
    const itemCount = await page.locator(ITEM).count()
    if (itemCount >= 2) {
      await newSession(page)
    }
    // With 0 or 1 questions, the region should not be rendered.
    await expect(region).toHaveCount(0, { timeout: 10000 })
  })

  test('collapsed shows dashes without titles, hover expands wrapper revealing titles', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Rail test 1.')
    await sendMessage(page, 'Reply only with OK. Rail test 2.')

    const dashes = page.locator(DASH)
    await expect(dashes).toHaveCount(2, { timeout: 15000 })

    // Collapsed: wrapper is not expanded, titles are hidden.
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).not.toHaveAttribute('data-expanded', 'true')
    const titles = page.locator(TITLE)
    await expect(titles.first()).toBeHidden()

    // Hover the region to expand.
    const region = page.locator(REGION)
    await region.hover()
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })

    // Expanded: titles are visible.
    await expect(titles.first()).toBeVisible()
    await expect(titles.nth(0)).toHaveText('Reply only with OK. Rail test 1.')
    await expect(titles.nth(1)).toHaveText('Reply only with OK. Rail test 2.')

    // <=8 items, fit-content width: the expanded wrapper must stay anchored
    // to the host's right edge while growing leftward.
    const edges = await rightEdges(page)
    expect(edges).not.toBeNull()
    expect(Math.abs(edges.hostRight - edges.wrapperRight)).toBeLessThanOrEqual(2)
  })

  test('collapsed background is visually absent, expanded background is visible and fills wrapper', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Bg test 1.')
    await sendMessage(page, 'Reply only with OK. Bg test 2.')

    await expect(page.locator(DASH)).toHaveCount(2, { timeout: 15000 })

    // Collapsed: background must be visually transparent (computed opacity 0).
    const bgOpacity = await page.evaluate(() => {
      const bg = document.querySelector('[data-outline-background]')
      return bg === null ? null : Number.parseFloat(getComputedStyle(bg).opacity)
    })
    expect(bgOpacity).toBe(0)

    // Hover to expand.
    const region = page.locator(REGION)
    await region.hover()
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })

    // Expanded: background must be visible (computed opacity 1).
    await expect.poll(() => page.evaluate(() => {
      const bg = document.querySelector('[data-outline-background]')
      return bg === null ? null : Number.parseFloat(getComputedStyle(bg).opacity)
    }), { timeout: 2000 }).toBe(1)

    // Expanded: background must be a descendant of wrapper and fill it
    // (same left/right/top/bottom within 2px).
    const alignment = await backgroundWrapperAlignment(page)
    expect(alignment).not.toBeNull()
    expect(alignment.bgIsDescendant).toBe(true)
    expect(alignment.leftDiff).toBeLessThanOrEqual(2)
    expect(alignment.rightDiff).toBeLessThanOrEqual(2)
    expect(alignment.topDiff).toBeLessThanOrEqual(2)
    expect(alignment.bottomDiff).toBeLessThanOrEqual(2)
  })

  test('dark mode: expanded background uses dark surface, not white', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Dark mode test 1.')
    await sendMessage(page, 'Reply only with OK. Dark mode test 2.')

    await expect(page.locator(DASH)).toHaveCount(2, { timeout: 15000 })

    // DSH toggles dark mode through a body attribute.
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))

    const region = page.locator(REGION)
    await region.hover()
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })

    const bgColor = await page.evaluate(() => {
      const bg = document.querySelector('[data-outline-background]')
      return bg === null ? null : getComputedStyle(bg).backgroundColor
    })
    expect(bgColor).not.toBeNull()
    expect(bgColor).not.toContain('rgba(255, 255, 255')
    expect(bgColor).not.toContain('rgb(255, 255, 255')
    const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(bgColor)
    expect(match).not.toBeNull()
    const channels = match.slice(1, 4).map(Number)
    expect(Math.min(...channels)).toBeLessThanOrEqual(80)

    // Capture QA evidence of the dark-mode expanded panel.
    await page.screenshot({ path: 'dark-mode-expanded.png' })

    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  })

  test('short session: expanded wrapper shrinks to content and centers in region', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Center test 1.')
    await sendMessage(page, 'Reply only with OK. Center test 2.')

    await expect(page.locator(DASH)).toHaveCount(2, { timeout: 15000 })

    // Expand the wrapper.
    await page.locator(REGION).hover()
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })

    // Wait for width transition to settle.
    let previousWidth = 0
    await expect.poll(async () => {
      const width = await page.evaluate(() => {
        const el = document.querySelector('[data-outline-wrapper]')
        return el === null ? 0 : Number.parseFloat(getComputedStyle(el).width)
      })
      const settled = width > 34 && width === previousWidth
      previousWidth = width
      return settled
    }, { timeout: 5000 }).toBe(true)

    // Wrapper height must not exceed page max (250px) for a short 2-item list.
    // 2 items × 30px + 30px padding = 90px, well under 250px.
    const geom = await wrapperCenterGeometry(page)
    expect(geom).not.toBeNull()
    expect(geom.wrapperHeight).toBeLessThanOrEqual(250)
    // Wrapper must be vertically centered within the region (within 2px).
    expect(geom.wrapperCenterOffset).toBeLessThanOrEqual(2)
  })

  test('click on title scrolls to the corresponding chat row', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Title test 1.')
    await sendMessage(page, 'Reply only with OK. Title test 2.')

    await expect(page.locator(ITEM)).toHaveCount(2, { timeout: 15000 })

    // Expand the wrapper; wait for the expanded attribute and for the width
    // transition (0.2s ease) to settle before dispatching the click.
    await page.locator(REGION).hover()
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })
    let previousWidth = 0
    await expect.poll(async () => {
      const width = await page.evaluate(() => {
        const el = document.querySelector('[data-outline-wrapper]')
        return el === null ? 0 : Number.parseFloat(getComputedStyle(el).width)
      })
      const settled = width > 34 && width === previousWidth
      previousWidth = width
      return settled
    }, { timeout: 5000 }).toBe(true)
    await expect(page.locator(TITLE).nth(1)).toBeVisible({ timeout: 2000 })

    // Click the second item's title area.
    const secondKey = await page.locator(ITEM).nth(1).getAttribute('data-key')
    expect(secondKey).toBeTruthy()
    await page.locator(ITEM).nth(1).dispatchEvent('click')

    await expect.poll(() => page.evaluate((key) => {
      const row = document.querySelector(`[data-chat-anchor-key="${key}"]`)
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (!row || !scroller) return false
      const rowTop = row.getBoundingClientRect().top
      const scrollerTop = scroller.getBoundingClientRect().top
      const scrollerHeight = scroller.clientHeight
      return Math.abs(rowTop - scrollerTop - scrollerHeight / 2) < 250
    }, secondKey), { timeout: 10000 }).toBe(true)
  })

  test('active dash follows the reference 40% reading line', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    for (let i = 1; i <= 5; i++) {
      await sendMessage(page, `Reply only with OK. Active dash ${i}.`)
    }

    const dashes = page.locator(DASH)
    await expect(dashes).toHaveCount(5, { timeout: 30000 })

    // At the top, the dash nearest the 40% reading line becomes active.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-conversation-scroll]')
      scroller.scrollTop = 0
      scroller.dispatchEvent(new Event('scroll'))
    })
    const topKey = await readingLineKey(page)
    expect(topKey).toBeTruthy()
    await expect.poll(() => page.evaluate((key) => {
      return [...document.querySelectorAll('[data-testid="outline-item"]')]
        .find(item => item.getAttribute('data-key') === key)
        ?.getAttribute('data-active')
    }, topKey), { timeout: 5000 }).toBe('true')

    // At the bottom, recompute the reference line from the live geometry.
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight
        scroller.dispatchEvent(new Event('scroll'))
      }
    })
    const bottomKey = await readingLineKey(page)
    expect(bottomKey).toBeTruthy()
    await expect.poll(() => page.evaluate((key) => {
      return [...document.querySelectorAll('[data-testid="outline-item"]')]
        .find(item => item.getAttribute('data-key') === key)
        ?.getAttribute('data-active')
    }, bottomKey), { timeout: 5000 }).toBe('true')
  })

  test('reference geometry: region centered, wrapper expands, page scrolls', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    for (let index = 1; index <= 9; index += 1) {
      await sendMessage(page, `Reply only with OK. Timeline test ${index}.`)
    }

    await expect(page.locator(DASH)).toHaveCount(9, { timeout: 30000 })

    // Expand the wrapper and wait for the full 240px width (the 0.2s ease
    // transition is intentional) before measuring geometry.
    await page.locator(REGION).hover()
    const wrapper = page.locator(WRAPPER)
    await expect(wrapper).toHaveAttribute('data-expanded', 'true', { timeout: 2000 })
    await expect.poll(async () => page.evaluate(() => {
      const el = document.querySelector('[data-outline-wrapper]')
      return el === null ? null : getComputedStyle(el).width
    }), { timeout: 5000 }).toBe('240px')

    const geometry = await referenceGeometry(page)
    expect(geometry).not.toBeNull()
    // Region fits within the 300px rail height.
    expect(geometry.regionHeight).toBeLessThanOrEqual(300)
    // The region is vertically centered relative to the host frame.
    expect(geometry.regionCenterOffset).toBeLessThanOrEqual(2)
    // Wrapper is expanded with pointer-events auto.
    expect(geometry.wrapperPointerEvents).toBe('auto')
    // The page keeps its fixed 250px scroll box.
    expect(geometry.pageMaxHeight).toBe('250px')
    expect(geometry.pageOverflowY).toBe('auto')
    // Padding matches reference spec.
    expect(geometry.pagePaddingTop).toBe('15px')
    expect(geometry.pagePaddingLeft).toBe('24px')
    // The host must be inset from the viewport right edge by at least the
    // scrollbar-width gap (16px), so the rail never touch the window border.
    expect(geometry.viewportWidth - geometry.hostRight).toBeGreaterThanOrEqual(14)

    // >8 items: wrapper should be fixed 240px wide.
    const wrapperWidth = await page.evaluate(() => {
      const wrapper = document.querySelector('[data-outline-wrapper]')
      return wrapper ? getComputedStyle(wrapper).width : null
    })
    expect(wrapperWidth).toBe('240px')

    // The expanded wrapper's right edge must remain anchored to the host's
    // right edge while the fixed-width body grows leftward.
    const edges = await rightEdges(page)
    expect(edges).not.toBeNull()
    expect(Math.abs(edges.hostRight - edges.wrapperRight)).toBeLessThanOrEqual(2)

    // QA evidence: full-page screenshot showing the right-edge gap.
    await page.screenshot({ path: 'rail-right-gap.png' })

    // Page should be scrollable with 9 items.
    const pageScroll = await page.evaluate(() => {
      const pageEl = document.querySelector('[data-outline-page]')
      if (!(pageEl instanceof HTMLElement)) return null
      pageEl.scrollTop = pageEl.scrollHeight
      return { clientHeight: pageEl.clientHeight, scrollHeight: pageEl.scrollHeight, scrollTop: pageEl.scrollTop }
    })
    expect(pageScroll).not.toBeNull()
    expect(pageScroll.scrollHeight).toBeGreaterThan(pageScroll.clientHeight)
    expect(pageScroll.scrollTop).toBeGreaterThan(0)
  })

  test('tool/background messages are not indexed and surfaces stay healthy', async ({ page }) => {
    test.setTimeout(180000)
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Tool test 1.')
    await sendMessage(page, 'Use the workspace file listing tool to list the top-level workspace, then reply only with OK.')

    const dashes = page.locator(DASH)
    await expect(dashes).toHaveCount(2, { timeout: 15000 })

    await expect(page.locator('[data-shell-overlay]')).toBeVisible()
    await expect(page.locator('[data-conversation-scroll]')).toBeVisible()
    await expect(page.locator('[data-composer-seat]')).toBeVisible()

    const outlineErrors = errors.filter(e => /outline|conversation-outline/.test(e))
    expect(outlineErrors).toEqual([])
  })

  test('locale switching keeps rail healthy', async ({ page }) => {
    test.setTimeout(180000)
    await newSession(page)
    await sendMessage(page, 'Reply only with OK. Locale test 1.')

    const host = page.locator('[data-outline-host]')
    await expect(host).toBeVisible()

    // Switch to Chinese via settings.
    await switchLocale(page, '中文')
    await page.goto(BASE)
    await waitForStableRail(page)

    // After locale switch, with only 1 question, the region should be hidden.
    await expect(page.locator(REGION)).toHaveCount(0, { timeout: 10000 })

    // Send another message to get 2 questions and verify the rail renders.
    await sendMessage(page, 'Reply only with OK. Locale test 2.')
    await expect(page.locator(DASH)).toHaveCount(2, { timeout: 15000 })

    // Expand and verify titles render.
    await page.locator(REGION).hover()
    await expect(page.locator(TITLE).first()).toBeVisible({ timeout: 2000 })
  })
})
