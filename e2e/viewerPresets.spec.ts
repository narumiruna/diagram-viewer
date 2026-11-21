import { expect, type Locator, type Page, test } from "@playwright/test"

function action(viewer: Locator, name: string) {
  return viewer.getByRole("button", { name, exact: true })
}

async function openPreset(page: Page, query = "") {
  await page.goto(`/?presets${query}`)
  return page.locator(".preset-viewer")
}

async function expectReady(viewer: Locator) {
  await expect(action(viewer, "Zoom in")).toBeEnabled()
  await expect(viewer.locator(".ndv-stage")).not.toHaveCSS("transform", "none")
}

const cameraActions = ["Zoom out", "Zoom in", "Fit to screen", "Reset zoom", "Fullscreen"]
const fileActions = ["Show source", "Copy source", "Download SVG", "Download PNG"]

async function box(locator: Locator) {
  const bounds = await locator.boundingBox()
  if (!bounds) throw new Error(`Missing bounds for ${locator}`)
  return bounds
}

async function names(scope: Locator) {
  return scope
    .locator("button")
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")))
}

async function clickHost(page: Page, name: string) {
  // Host-driven updates do not move focus to the fixture's host control.
  await page
    .getByRole("button", { name, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
}

async function projection(viewer: Locator) {
  return viewer.evaluate((root) => {
    const viewport = root.querySelector<HTMLElement>(".ndv-viewport")
    const stage = root.querySelector(".ndv-stage")
    const thumbnail = root.querySelector<HTMLImageElement>(".ndv-overview-image img")
    const frame = root.querySelector(".ndv-overview-frame")
    if (!viewport || !stage || !thumbnail?.naturalWidth || !frame)
      throw new Error("Missing overview geometry")

    const view = viewport.getBoundingClientRect()
    const style = getComputedStyle(viewport)
    const live = stage.getBoundingClientRect()
    const left = Math.max(
      live.left,
      view.left + viewport.clientLeft + parseFloat(style.paddingLeft),
    )
    const top = Math.max(live.top, view.top + viewport.clientTop + parseFloat(style.paddingTop))
    const right = Math.min(
      live.right,
      view.left + viewport.clientLeft + viewport.clientWidth - parseFloat(style.paddingRight),
    )
    const bottom = Math.min(
      live.bottom,
      view.top + viewport.clientTop + viewport.clientHeight - parseFloat(style.paddingBottom),
    )

    // Derive the actual centered image content, excluding any letterbox pixels.
    const img = thumbnail.getBoundingClientRect()
    const scale = Math.min(img.width / thumbnail.naturalWidth, img.height / thumbnail.naturalHeight)
    const width = thumbnail.naturalWidth * scale
    const height = thumbnail.naturalHeight * scale
    const x = img.left + (img.width - width) / 2
    const y = img.top + (img.height - height) / 2
    const expected = [
      x + ((left - live.left) / live.width) * width,
      y + ((top - live.top) / live.height) * height,
      ((right - left) / live.width) * width,
      ((bottom - top) / live.height) * height,
    ]
    const actual = frame.getBoundingClientRect()
    return {
      error: Math.max(
        ...[actual.x, actual.y, actual.width, actual.height].map((value, index) =>
          Math.abs(value - (expected[index] ?? 0)),
        ),
      ),
      x: (actual.left - x) / width,
      y: (actual.top - y) / height,
      width: actual.width / width,
      height: actual.height / height,
    }
  })
}

async function expectProjection(viewer: Locator) {
  await expect(viewer.locator(".ndv-overview-frame")).toBeVisible()
  await expect.poll(async () => (await projection(viewer)).error).toBeLessThan(1)
  return projection(viewer)
}

test("classic keeps the original toolbar and ignores canvas placement", async ({ page }) => {
  const viewers = await openPreset(page, "&toolbar=classic&compare")
  await expect(viewers).toHaveCount(2)
  for (const viewer of await viewers.all()) {
    await expectReady(viewer)
    await expect(viewer).not.toHaveClass(/ndv-viewer-alt|ndv-floating/)
    await expect(viewer.locator("fieldset")).toHaveCount(1)
    expect(await names(viewer)).toEqual([...cameraActions, ...fileActions])
    await expect(action(viewer, "Overview")).toHaveCount(0)
  }
  const markup = await viewers.evaluateAll((roots) =>
    roots.map((root) => root.outerHTML.replace(/(id|aria-controls)="[^"]*"/g, '$1=""')),
  )
  expect(markup[0]).toBe(markup[1])
})

test("the package defaults to floating canvas controls and a closed, icon-only Overview", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const viewer = await openPreset(page)
  await expectReady(viewer)
  const lane = viewer.locator(".ndv-canvas-controls")
  const toggle = action(viewer, "Overview")
  await expect(viewer).toHaveClass(/ndv-canvas.*ndv-floating/)
  await expect(lane).toHaveCSS("pointer-events", "none")
  await expect(toggle).toHaveText("")
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await expect(viewer.locator(".ndv-overview")).toBeHidden()
  await toggle.click()
  await expectProjection(viewer)
  await page.setViewportSize({ width: 380, height: 900 })
  await expect(lane).toHaveCSS("pointer-events", "auto")
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
})

for (const toolbar of ["classic", "grouped", "canvas"]) {
  test(`${toolbar}: Overview disclosure, icon tooltips, and labeled targets`, async ({ page }) => {
    const viewer = await openPreset(page, `&toolbar=${toolbar}&overview`)
    await expectReady(viewer)
    const overview = action(viewer, "Overview")
    const panel = viewer.locator(".ndv-overview")
    await expect(overview).toHaveText("")
    const icon = await overview.locator("path").getAttribute("d")
    for (const name of ["Fit to screen", "Fullscreen"]) {
      expect(icon).not.toBe(await action(viewer, name).locator("path").getAttribute("d"))
    }
    await expect(overview).toHaveAttribute("aria-expanded", "false")
    await expect(panel).toBeHidden()
    await overview.hover()
    const tip = viewer.getByRole("tooltip", { name: "Overview", exact: true })
    await expect(tip).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(tip).toHaveCount(0)
    await overview.focus()
    await expect(tip).toBeVisible()
    const originalButton = await overview.elementHandle()
    await page.keyboard.press("Enter")
    await expect(overview).toBeFocused()
    await expect(overview).toHaveAttribute("aria-expanded", "true")
    await expect(panel).toHaveAttribute("id", (await overview.getAttribute("aria-controls")) ?? "")
    await expect(panel).toBeVisible()
    await page.keyboard.press("Space")
    await expect(overview).toBeFocused()
    await expect(overview).toHaveAttribute("aria-expanded", "false")
    await expect(panel).toBeHidden()
    expect(await overview.evaluate((node, original) => node === original, originalButton)).toBe(
      true,
    )
    await originalButton.dispose()

    await page.setViewportSize({ width: 380, height: 900 })
    await openPreset(page, `&toolbar=${toolbar}&display=icon-and-text&overview`)
    await expect(overview).toHaveText("Overview")
    await overview.click()
    await expect(panel).toBeVisible()
    for (const name of [...cameraActions, ...fileActions, "Overview"]) {
      const button = action(viewer, name)
      await expect(button).toHaveText(name)
      await expect(button).toBeVisible()
      const target = await box(button)
      const card = await box(viewer)
      expect(target.width).toBeGreaterThanOrEqual(44)
      expect(target.height).toBeGreaterThanOrEqual(44)
      expect(target.x).toBeGreaterThanOrEqual(card.x)
      expect(target.x + target.width).toBeLessThanOrEqual(card.x + card.width)
    }
    await expect(viewer.getByLabel("Current zoom")).toHaveText(/%$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(380)
  })
}

for (const toolbar of ["grouped", "canvas"]) {
  test(`${toolbar}: all actions remain available without Overview`, async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    const viewer = await openPreset(page, `&toolbar=${toolbar}&failed&noOverview&controls=docked`)
    await expect(viewer).toHaveClass(/ndv-viewer-alt/)
    await expect(viewer.locator(".ndv-status")).toHaveText("Could not render the diagram.")
    const retry = action(viewer, "Retry sequence diagram")
    await expect(retry).toHaveText("")
    await retry.click()
    await expectReady(viewer)
    await expect(viewer.locator(".ndv-stage > svg")).toBeVisible()
    await expect(action(viewer, "Overview")).toHaveCount(0)
    const bottom = viewer.locator(".ndv-canvas-controls .ndv-camera")
    if (toolbar === "canvas") {
      expect(await names(bottom)).toEqual(cameraActions)
      expect(await names(viewer.locator("fieldset").first())).toEqual(fileActions)
      await expect(viewer).not.toHaveClass(/ndv-floating/)
    } else {
      await expect(bottom).toHaveCount(0)
      expect(await names(viewer)).toEqual([...cameraActions, ...fileActions])
    }
    const fit = action(viewer, "Fit to screen")
    const fullscreen = action(viewer, "Fullscreen")
    expect(await fit.locator("svg").innerHTML()).not.toBe(
      await fullscreen.locator("svg").innerHTML(),
    )
    const zoom = viewer.getByLabel("Current zoom")
    await fit.click()
    const fitted = await zoom.textContent()
    await action(viewer, "Zoom in").click()
    await expect(zoom).not.toHaveText(fitted ?? "")
    await action(viewer, "Reset zoom").click()
    await expect(zoom).toHaveText("100%")
    await action(viewer, "Show source").click()
    const source = viewer.getByRole("region", { name: "Diagram source" })
    await expect(source).toContainText("sequenceDiagram")
    await action(viewer, "Copy source").click()
    await expect(viewer.locator(".ndv-status")).toHaveText("Copied to clipboard.")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      await source.textContent(),
    )
    await action(viewer, "Show sequence diagram").click()
    for (const format of ["SVG", "PNG"]) {
      const downloaded = page.waitForEvent("download")
      await action(viewer, `Download ${format}`).click()
      expect((await downloaded).suggestedFilename()).toBe(`preset-document.${format.toLowerCase()}`)
    }
    await openPreset(page, `&toolbar=${toolbar}&failed&display=icon-and-text`)
    await expect(retry).toHaveText("Retry sequence diagram")
  })
}

test("Overview follows real camera geometry through drag, zoom, resize and Fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const viewer = await openPreset(page, "&toolbar=canvas&overview")
  const viewport = viewer.locator(".ndv-viewport")
  const panel = viewer.locator(".ndv-overview")
  const image = panel.locator("img")
  const frame = panel.locator(".ndv-overview-frame")
  const overview = action(viewer, "Overview")
  const zoom = viewer.getByLabel("Current zoom")
  await page.addStyleTag({
    content: ".preset-viewer .ndv-viewport { padding: 13px 37px 31px 23px; }",
  })
  await expect(viewer.locator(".ndv-stage > svg")).toHaveAttribute("viewBox", "-73 -41 1100 500")
  await overview.click()
  await expect(image).toHaveAttribute("src", /^blob:/)
  await expect(panel.locator("svg")).toHaveCount(0)
  await expectProjection(viewer)
  for (let i = 0; i < 3; i++) await action(viewer, "Zoom in").click()
  const before = await expectProjection(viewer)
  expect(before.width).toBeLessThan(0.8)
  expect(before.height).toBeLessThan(0.8)
  const sameZoom = await zoom.textContent()
  const view = await box(viewport)
  const x = view.x + view.width * 0.65
  const y = view.y + view.height * 0.55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 90, y - 50, { steps: 5 })
  await page.mouse.up()
  const panned = await expectProjection(viewer)
  expect(panned.x).toBeGreaterThan(before.x + 0.035)
  expect(panned.y).toBeGreaterThan(before.y + 0.035)
  expect(panned.width).toBeCloseTo(before.width, 2)
  expect(panned.height).toBeCloseTo(before.height, 2)
  await expect(zoom).toHaveText(sameZoom ?? "")
  const card = await box(panel)
  expect(card.x).toBeGreaterThanOrEqual(view.x + view.width - 1)

  await overview.click()
  await expect(panel).toBeHidden()
  await expect.poll(async () => (await box(viewport)).width).toBeGreaterThan(view.width)
  await expect(zoom).toHaveText(sameZoom ?? "")
  await overview.click()
  await expectProjection(viewer)
  await expect(zoom).toHaveText(sameZoom ?? "")

  await page.setViewportSize({ width: 380, height: 900 })
  await expect
    .poll(async () => {
      const canvas = await box(viewport)
      return (await box(panel)).y - (canvas.y + canvas.height)
    })
    .toBeGreaterThanOrEqual(-1)
  const resized = await expectProjection(viewer)
  expect(resized.width).toBeLessThan(panned.width)
  await expect(zoom).toHaveText(sameZoom ?? "")
  const originalPanel = await panel.elementHandle()
  const imageBeforeFit = await box(image)
  await action(viewer, "Fit to screen").click()
  const fitted = await expectProjection(viewer)
  expect(fitted.x).toBeCloseTo(0, 2)
  expect(fitted.y).toBeCloseTo(0, 2)
  expect(fitted.width).toBeCloseTo(1, 2)
  expect(fitted.height).toBeCloseTo(1, 2)
  const imageAfterFit = await box(image)
  expect(imageAfterFit.width).toBeCloseTo(imageBeforeFit.width, 1)
  expect(imageAfterFit.height).toBeCloseTo(imageBeforeFit.height, 1)
  expect(await panel.evaluate((node, original) => node === original, originalPanel)).toBe(true)
  await originalPanel.dispose()

  await page.emulateMedia({ forcedColors: "active" })
  const contrast = await frame.evaluate((element) => {
    const style = getComputedStyle(element)
    const panel = element.closest(".ndv-overview")
    return (
      panel &&
      style.outlineStyle !== "none" &&
      parseFloat(style.outlineWidth) >= 1 &&
      style.outlineColor !== getComputedStyle(panel).backgroundColor
    )
  })
  expect(contrast).toBe(true)
})

test("source, fullscreen and preset changes keep the live stage and chosen camera", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const viewer = await openPreset(page, "&toolbar=grouped&overview")
  const stage = viewer.locator(".ndv-stage")
  const svg = stage.locator("svg")
  const panel = viewer.locator(".ndv-overview")
  const overview = action(viewer, "Overview")
  const zoom = viewer.getByLabel("Current zoom")
  await expectReady(viewer)
  const originalStage = await stage.elementHandle()
  const originalSVG = await svg.elementHandle()
  await action(viewer, "Reset zoom").click()
  await overview.click()
  await expect(panel).toBeVisible()
  await expect(zoom).toHaveText("100%")
  await action(viewer, "Show source").click()
  await expect(action(viewer, "Show sequence diagram")).toBeFocused()
  await expect(overview).toHaveCount(0)
  await expect(panel).toBeHidden()
  await expect(stage).toBeHidden()
  await action(viewer, "Show sequence diagram").click()
  await expect(overview).toHaveAttribute("aria-expanded", "true")
  await expect(panel).toBeVisible()
  for (const toolbar of ["canvas", "classic", "grouped"]) {
    await clickHost(page, `Use ${toolbar} toolbar`)
    await expect(overview).toHaveAttribute("aria-expanded", "true")
    await expect(stage).toBeVisible()
    await expect(zoom).toHaveText("100%")
    expect(await stage.evaluate((node, original) => node === original, originalStage)).toBe(true)
    expect(await svg.evaluate((node, original) => node === original, originalSVG)).toBe(true)
  }
  const fullscreen = action(viewer, "Fullscreen")
  await fullscreen.click()
  await expect.poll(() => viewer.evaluate((root) => root === document.fullscreenElement)).toBe(true)
  await expect(overview).toHaveAttribute("aria-expanded", "true")
  await expectProjection(viewer)
  await action(viewer, "Exit fullscreen").click()
  await expect(fullscreen).toBeFocused()
  await expect(overview).toHaveAttribute("aria-expanded", "true")
  await expectProjection(viewer)
  await expect(zoom).toHaveText("100%")
  expect(await stage.evaluate((node, original) => node === original, originalStage)).toBe(true)
  expect(await svg.evaluate((node, original) => node === original, originalSVG)).toBe(true)
  await originalStage.dispose()
  await originalSVG.dispose()
})

test("floating controls keep their tab order and fall back based on viewer width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const viewer = await openPreset(page, "&toolbar=canvas&controls=floating&overview")
  const viewport = viewer.locator(".ndv-viewport")
  const panel = viewer.locator(".ndv-overview")
  const lane = viewer.locator(".ndv-canvas-controls")
  const dock = lane.locator(".ndv-camera")
  const hint = lane.locator(".ndv-pan-hint")
  const fit = action(viewer, "Fit to screen")
  const overview = action(viewer, "Overview")
  await expect(viewer).toHaveClass(/ndv-canvas/)
  await expect(viewer).toHaveClass(/ndv-floating/)
  await overview.click()
  await action(viewer, "Zoom in").click()
  await expect(hint).toBeVisible()
  await expect(lane).toHaveCSS("pointer-events", "none")
  await expect(fit).toHaveCSS("pointer-events", "auto")
  const laneBox = await box(lane)
  const dockBox = await box(dock)
  const hintBox = await box(hint)
  expect(hintBox.x + hintBox.width).toBeLessThan(dockBox.x)
  expect(laneBox.x + laneBox.width - (dockBox.x + dockBox.width)).toBeLessThan(24)
  for (const surface of [viewport, panel]) {
    const bounds = await box(surface)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(laneBox.y + 1)
  }
  expect(
    await hint.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return (
        hit?.closest(".ndv-root") === element.closest(".ndv-root") &&
        !hit?.closest(".ndv-canvas-controls")
      )
    }),
  ).toBe(true)

  const order = await names(dock)
  expect(order).toEqual([...cameraActions, "Overview"])
  const originalFit = await fit.elementHandle()
  const originalOverview = await overview.elementHandle()
  await fit.focus()
  await page.keyboard.press("Tab")
  await expect(action(viewer, "Reset zoom")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await expect(fit).toBeFocused()
  await clickHost(page, "Narrow viewer")
  await expect(lane).toHaveCSS("pointer-events", "auto")
  expect((await box(viewer)).width).toBeCloseTo(360, 0)
  expect(await page.evaluate(() => innerWidth)).toBe(1280)
  await expect
    .poll(() =>
      viewer.evaluate((root) => {
        const viewport = root.querySelector(".ndv-viewport")?.getBoundingClientRect()
        const panel = root.querySelector(".ndv-overview")?.getBoundingClientRect()
        const lane = root.querySelector(".ndv-canvas-controls")?.getBoundingClientRect()
        return Boolean(
          viewport &&
            panel &&
            lane &&
            panel.y >= viewport.bottom - 1 &&
            lane.y >= panel.bottom - 1 &&
            lane.width >= root.getBoundingClientRect().width - 2,
        )
      }),
    )
    .toBe(true)
  await expect(fit).toBeFocused()
  expect(await names(dock)).toEqual(order)
  expect(await fit.evaluate((node, original) => node === original, originalFit)).toBe(true)
  expect(await overview.evaluate((node, original) => node === original, originalOverview)).toBe(
    true,
  )
  await page.keyboard.press("Tab")
  await expect(action(viewer, "Reset zoom")).toBeFocused()
  await clickHost(page, "Widen viewer")
  await expect(lane).toHaveCSS("pointer-events", "none")
  await expect(action(viewer, "Reset zoom")).toBeFocused()
  await originalFit.dispose()
  await originalOverview.dispose()
})

test("replacing SVG updates the thumbnail, restores viewport focus and revokes old images", async ({
  page,
}) => {
  const viewer = await openPreset(page, "&toolbar=canvas&overview")
  const overview = action(viewer, "Overview")
  const viewport = viewer.locator(".ndv-viewport")
  const image = viewer.locator(".ndv-overview-image img")
  const url = () => image.evaluate((element: HTMLImageElement) => element.src)
  const exists = (url: string) =>
    page.evaluate(async (url) => {
      try {
        return (await fetch(url)).ok
      } catch {
        return false
      }
    }, url)

  await overview.click()
  await expectProjection(viewer)
  const originalUrl = await url()
  await expect(overview).toBeFocused()
  await clickHost(page, "Replace SVG")
  await expect(viewport).toBeFocused()
  await expect(viewer.locator(".ndv-stage svg")).toHaveAttribute("viewBox", "0 0 800 400")
  await expect(overview).toHaveAttribute("aria-expanded", "true")
  await expect.poll(url).not.toBe(originalUrl)
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(800)
  await expectProjection(viewer)
  await expect.poll(() => exists(originalUrl)).toBe(false)
  const replacement = await url()
  expect(await exists(replacement)).toBe(true)
  await page.getByRole("button", { name: "Unmount preset" }).click()
  await expect(viewer).toHaveCount(0)
  await expect.poll(() => exists(replacement)).toBe(false)
})

test("Overview IDs and choices are independent across instances", async ({ page }) => {
  const viewers = await openPreset(page, "&compare&overview")
  const [first, second] = [viewers.first(), viewers.last()]
  await action(first, "Overview").click()
  await expect(action(second, "Overview")).toHaveAttribute("aria-expanded", "false")
  await expect(second.locator(".ndv-overview")).toBeHidden()
  await action(second, "Overview").click()
  const firstPanel = first.locator(".ndv-overview")
  const secondPanel = second.locator(".ndv-overview")
  await expect(firstPanel).toBeVisible()
  await expect(secondPanel).toBeVisible()
  const firstId = await action(first, "Overview").getAttribute("aria-controls")
  const secondId = await action(second, "Overview").getAttribute("aria-controls")
  expect(firstId).toBeTruthy()
  expect(secondId).toBeTruthy()
  expect(firstId).not.toBe(secondId)
  await expect(firstPanel).toHaveAttribute("id", firstId ?? "")
  await expect(secondPanel).toHaveAttribute("id", secondId ?? "")
})

test("Overview waits for readiness and is absent without SVG or in host-managed viewers", async ({
  page,
}) => {
  const viewer = await openPreset(page, "&toolbar=canvas&overview&loading")
  await expect(action(viewer, "Fit to screen")).toBeDisabled()
  await expect(viewer.locator(".ndv-stage svg")).toBeAttached()
  await expect(action(viewer, "Overview")).toHaveCount(0)
  await expect(viewer.locator(".ndv-overview")).toBeHidden()
  await page.getByRole("button", { name: "Finish loading" }).click()
  await expect(action(viewer, "Overview")).toHaveAttribute("aria-expanded", "false")

  await openPreset(page, "&toolbar=grouped&overview&missing")
  await expect(viewer.locator(".ndv-stage svg")).toHaveCount(0)
  await expect(action(viewer, "Overview")).toHaveCount(0)
  await expect(viewer.locator(".ndv-overview")).toBeHidden()
  await expect(action(viewer, "Show source")).toBeEnabled()

  await page.goto("/?liveOverview")
  const live = page.locator(".live-viewer")
  await expectReady(live)
  await expect(live.getByRole("slider", { name: "Minimum amount" })).toBeVisible()
  await expect(action(live, "Overview")).toHaveCount(0)
  await expect(live.locator(".ndv-overview")).toBeHidden()
})

test("blocked thumbnail loads leave the diagram and camera usable", async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      if (event.effectiveDirective === "img-src")
        document.documentElement.dataset.blockedImage = event.blockedURI
    })
  })
  await page.route(/\/\?presets/, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": "img-src 'none'" },
    })
  })
  const viewer = await openPreset(page, "&toolbar=canvas&overview")
  await expect(page.locator("html")).toHaveAttribute("data-blocked-image", /^blob/)
  await expectReady(viewer)
  await expect(action(viewer, "Overview")).toHaveCount(0)
  await expect(viewer.locator(".ndv-overview")).toBeHidden()
  const zoom = viewer.getByLabel("Current zoom")
  const before = await zoom.textContent()
  await action(viewer, "Zoom in").click()
  await expect(zoom).not.toHaveText(before ?? "")
})

// Opt in to local review captures; no image baselines are checked into the repository.
// On WSL, verify the Wayland connection before launching Chromium.
// With the pre-feature build, run:
// NDV_PRESET_SCREENSHOTS=before npx playwright test e2e/viewerPresets.spec.ts -g 'capture presets' --output /tmp/ndv-before
// With the new build, use NDV_PRESET_SCREENSHOTS=after and --output /tmp/ndv-after.
for (const theme of ["light", "dark"] as const) {
  for (const width of [380, 1280]) {
    test(`capture presets: ${theme}, ${width}px`, async ({ page }, testInfo) => {
      const capture = process.env.NDV_PRESET_SCREENSHOTS
      test.skip(capture !== "before" && capture !== "after", "Local review capture only")
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: theme })
      const variants: [name: string, query: string][] = [["default", ""]]
      if (capture === "after") {
        variants.push(
          ["classic-overview", "&toolbar=classic&overview"],
          ["classic", "&toolbar=classic"],
          ["canvas-docked-overview", "&toolbar=canvas&controls=docked&overview"],
          ["canvas-floating-overview", "&overview"],
        )
      }
      for (const [name, query] of variants) {
        const viewer = await openPreset(page, `&theme=${theme}${query}`)
        await expectReady(viewer)
        if (query.includes("overview")) {
          await action(viewer, "Overview").click()
          await expect(viewer.locator(".ndv-overview-frame")).toBeVisible()
          await action(viewer, "Zoom in").click()
          await action(viewer, "Zoom in").blur()
          await page.mouse.move(0, 0)
          await expectProjection(viewer)
        }
        const filename = `${capture}-${name}-${theme}-${width}.png`
        const path = testInfo.outputPath(filename)
        await viewer.screenshot({ path, animations: "disabled" })
        await testInfo.attach(filename, { path, contentType: "image/png" })
      }
    })
  }
}
