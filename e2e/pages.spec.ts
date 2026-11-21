import { devices, expect, type Locator, type Page, test } from "@playwright/test"

const site = "http://127.0.0.1:4176/diagram-viewer/"

function example(page: Page, name: string) {
  return page.getByRole("article", { name, exact: true })
}

function button(example: Locator, name: string) {
  return example.getByRole("button", { name, exact: true })
}

test("the built Pages site compares four settings on a real viewer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  const errors: string[] = []
  const requests: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("requestfailed", (request) => errors.push(request.url()))
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    if (response.url().startsWith("http")) requests.push(response.url())
  })
  await page.goto(site)
  await expect(page.getByRole("article")).toHaveCount(9)
  await expect(page.locator(".ndv-stage > svg")).toHaveCount(9)
  expect(
    new Set(
      await page.locator(".ndv-stage").evaluateAll((nodes) => nodes.map((node) => node.innerHTML)),
    ).size,
  ).toBe(1)

  const classic = example(page, "Classic")
  const grouped = example(page, "Grouped")
  const canvas = example(page, "Canvas")
  await expect(classic.locator(".ndv-stage > svg")).toBeInViewport({ ratio: 0.1 })
  const code = classic.getByText(/<DiagramViewer/)
  await expect(code).toBeHidden()
  await classic.getByText("View JSX").press("Enter")
  await expect(code).toContainText('toolbar="classic"')
  await expect(code).toBeVisible()
  await classic.getByText("View JSX").press("Enter")
  for (const article of await page.getByRole("article").all()) {
    const name = await article.getByRole("heading").textContent()
    const region = article.getByRole("region", { name: name ?? "", exact: true })
    await expect(region).toHaveAccessibleDescription(
      "Use arrow keys to pan, plus or minus to zoom, and zero to fit.",
    )
  }
  await expect(page.getByRole("region", { name: /^Interactive diagram/ })).toHaveCount(0)
  await expect(classic.locator("fieldset")).toHaveCount(1)
  await expect(grouped.locator(".ndv-control-group")).toHaveCount(3)
  await expect(canvas.getByRole("group", { name: "Diagram view controls" })).toBeVisible()
  expect(
    (await canvas.getByRole("group", { name: "Diagram view controls" }).boundingBox())?.y,
  ).toBeGreaterThan((await canvas.locator(".ndv-viewport").boundingBox())?.y ?? Infinity)

  const docked = example(page, "Docked")
  const floating = example(page, "Floating")
  await expect(docked.locator(".ndv-canvas-controls")).toHaveCSS("pointer-events", "auto")
  await expect(floating.locator(".ndv-canvas-controls")).toHaveCSS("pointer-events", "none")
  expect((await floating.boundingBox())?.x).toBeGreaterThan(
    (await docked.boundingBox())?.x ?? Infinity,
  )
  await expect(page.locator(".wide-reference")).toBeHidden()

  await expect(button(example(page, "Icons"), "Zoom in")).toHaveText("")
  await expect(button(example(page, "Icons and text"), "Zoom in")).toHaveText("Zoom in")

  const off = example(page, "Overview off")
  const on = example(page, "Overview on")
  const toggle = button(on, "Overview")
  await expect(button(off, "Overview")).toHaveCount(0)
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  const frame = on.locator(".ndv-overview-frame")
  await expect(frame).toBeVisible()
  const initialFrame = await frame.boundingBox()
  const offZoom = await off.locator("output").textContent()
  await button(on, "Zoom in").click()
  await button(on, "Zoom in").click()
  await expect
    .poll(async () => (await frame.boundingBox())?.width)
    .toBeLessThan(initialFrame?.width ?? 0)
  await expect(off.locator("output")).toHaveText(offZoom ?? "")

  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute(
    "href",
    /^\/diagram-viewer\/assets\//,
  )
  expect(requests.some((url) => url.endsWith(".js"))).toBe(true)
  expect(requests.some((url) => url.endsWith(".css"))).toBe(true)
  expect(requests.filter((url) => !url.startsWith(site))).toEqual([])
  expect(errors).toEqual([])
})

test("live result handles keyboard, pan, source, fullscreen, and downloads", async ({ page }) => {
  await page.goto(site)
  await page.keyboard.press("Tab")
  const jump = page.getByRole("link", { name: "Compare settings" })
  await expect(jump).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(`${site}#compare`)
  await page.keyboard.press("Tab")
  await expect(example(page, "Classic").locator("button:focus-visible")).toHaveCount(1)

  const canvas = example(page, "Canvas")
  const viewport = canvas.locator(".ndv-viewport")
  await button(canvas, "Fit to screen").click()
  const fit = await canvas.locator("output").textContent()
  await viewport.press("+")
  await viewport.press("+")
  await expect(canvas.locator("output")).not.toHaveText(fit ?? "")
  await viewport.scrollIntoViewIfNeeded()
  const stage = canvas.locator(".ndv-stage")
  const transform = await stage.evaluate((el) => el.style.transform)
  const bounds = await viewport.boundingBox()
  if (!bounds) throw new Error("Expected a visible canvas viewport")
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 50, y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => stage.evaluate((el) => el.style.transform)).not.toBe(transform)
  await button(canvas, "Fit to screen").click()
  await expect(canvas.locator("output")).toHaveText(fit ?? "")

  await button(canvas, "Show source").click()
  await expect(canvas.getByRole("region", { name: "Diagram source" })).toContainText("flowchart LR")
  await button(canvas, "Show diagram").click()
  await expect(viewport).toBeVisible()
  await button(canvas, "Fullscreen").click()
  await button(canvas, "Exit fullscreen").click()
  await expect(button(canvas, "Fullscreen")).toBeFocused()
  for (const format of ["SVG", "PNG"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button(canvas, `Download ${format}`).click(),
    ])
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`))
    expect(await download.failure()).toBeNull()
  }
})

test("intermediate and narrow screens keep live results readable", async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 900 })
  await page.goto(site)
  const docked = example(page, "Docked")
  const floating = example(page, "Floating")
  await expect(floating.locator(".ndv-canvas-controls")).toHaveCSS("pointer-events", "none")
  expect((await floating.boundingBox())?.x).toBe((await docked.boundingBox())?.x)
  await expect(page.locator(".wide-reference")).toBeHidden()

  await page.setViewportSize({ width: 320, height: 800 })
  await expect(floating.locator(".ndv-canvas-controls")).toHaveCSS("pointer-events", "auto")
  const reference = page.getByRole("img", { name: /Wide viewers show Docked/ })
  await reference.scrollIntoViewIfNeeded()
  await expect(reference).toBeVisible()
  await expect
    .poll(() => reference.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(656)
  expect((await floating.boundingBox())?.y).toBeGreaterThan(
    (await docked.boundingBox())?.y ?? Infinity,
  )
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test("section links work by keyboard and on direct load", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 })
  await page.goto(site)
  await page.getByRole("link", { name: "Install", exact: true }).press("Enter")
  await expect(page).toHaveURL(`${site}#install`)
  const install = page.getByRole("heading", { name: "Use it in your app" })
  await expect(install).toBeInViewport()
  await expect(install).toBeFocused()

  const sections = {
    toolbar: "Toolbar layout",
    "canvas-controls": "Canvas control placement",
    "button-display": "Button labels",
    overview: "Overview map",
    install: "Use it in your app",
  }
  for (const [id, name] of Object.entries(sections)) {
    await page.goto("about:blank")
    await page.goto(`${site}#${id}`)
    await expect(page.getByRole("article")).toHaveCount(9)
    await expect(page.getByRole("heading", { name, exact: true })).toBeInViewport()
  }
})

test("tooltips fit at the screen edge, remain hoverable, and dismiss on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto(site)
  const classic = example(page, "Classic")
  const trigger = button(classic, "Download PNG")
  const tooltip = classic.getByRole("tooltip", { name: "Download PNG" })
  await trigger.hover()
  await expect(tooltip).toBeVisible()
  const bounds = await tooltip.boundingBox()
  if (!bounds) throw new Error("Expected a tooltip")
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  expect(bounds.y).toBeGreaterThanOrEqual(0)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(720)
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 8 })
  await expect(tooltip).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(tooltip).toHaveCount(0)
  await trigger.focus()
  await expect(tooltip).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(tooltip).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(tooltip).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test("touch demos show action labels before activation", async ({ browser }) => {
  const page = await browser.newPage(devices["iPhone 13"])
  try {
    await page.goto(site)
    const classic = example(page, "Classic")
    await expect(classic.locator(".ndv-stage > svg")).toBeInViewport({ ratio: 0.1 })
    const icons = example(page, "Icons")
    const zoom = button(icons, "Zoom in")
    await expect(zoom).toHaveText("Zoom in")
    await expect(icons.getByText(/shows labels on touch screens/)).toBeVisible()
    const previousZoom = await icons.locator("output").textContent()
    await zoom.tap()
    await expect(icons.locator("output")).not.toHaveText(previousZoom ?? "")
    await expect(icons.getByRole("tooltip")).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  } finally {
    await page.close()
  }
})

test("the HTML introduction and documentation work without JavaScript", async ({ browser }) => {
  const page = await browser.newPage({ javaScriptEnabled: false })
  try {
    await page.goto(site)
    await expect(page.getByRole("heading", { name: "Diagram Viewer", exact: true })).toBeVisible()
    await expect(page.locator("noscript p")).toHaveText(
      "Enable JavaScript to use the interactive examples.",
    )
    await expect(page.getByText("Main branch preview", { exact: false }).first()).toBeVisible()
    await expect(page.getByText(/latest stable release/)).toBeVisible()
    await expect(page.getByRole("link", { name: "release notes" })).toHaveAttribute(
      "href",
      "https://github.com/narumiruna/diagram-viewer/blob/main/CHANGELOG.md",
    )
    await expect(page.getByText("npm install @narumitw/diagram-viewer")).toBeVisible()
    await expect(page.getByRole("link", { name: "Full documentation" })).toHaveAttribute(
      "href",
      "https://github.com/narumiruna/diagram-viewer#readme",
    )
  } finally {
    await page.close()
  }
})
