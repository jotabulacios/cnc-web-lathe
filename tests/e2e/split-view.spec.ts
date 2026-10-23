import { test, expect, type Page } from '@playwright/test';

// Set SPLIT_VIEW_SCREENSHOTS=1 to save review captures in test-results/.
const captures = Boolean(process.env.SPLIT_VIEW_SCREENSHOTS);
const plane = (page: Page) => page.locator('.stage-view .lathe-viewport-svg');
const canvas = (page: Page) => page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
const executed = (page: Page) => page.locator('.lathe-viewport-svg [data-motion-id][data-executed=true]');
const next = (page: Page) => page.getByRole('button', { name: 'Siguiente bloque', exact: true });

async function interpret(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await expect(page.getByTestId('profile-status')).toHaveText('Perfil actualizado · bloque 0');
}

test('split view shows the 2D plane and the 3D part in sync, side by side', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await interpret(page);
  const split = page.getByRole('button', { name: 'Dividida', exact: true });
  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Vista 2D', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(plane(page)).toBeVisible();
  await expect(canvas(page)).toBeVisible();
  await expect(canvas(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Trayectoria/ })).toBeVisible();

  const a = (await plane(page).boundingBox())!;
  const b = (await canvas(page).boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
  expect(Math.abs(b.y - a.y)).toBeLessThan(80);

  const markerBefore = await page.getByTestId('tool-marker').boundingBox();
  for (let i = 1; i <= 3; i++) {
    await next(page).click();
    await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${i}`);
    await expect(canvas(page)).toHaveAttribute('data-profile-blocks', String(i));
  }
  // Both panes follow the same cursor: executed 2D moves and the 2D tool marker moved too.
  await expect.poll(() => executed(page).count()).toBeGreaterThan(0);
  const done = await executed(page).count();
  await expect.poll(async () => JSON.stringify(await page.getByTestId('tool-marker').boundingBox())).not.toBe(JSON.stringify(markerBefore));
  if (captures) await page.screenshot({ path: 'test-results/split-view-wide.png' });

  // The 2D-only toolpath toggle still drives the plane in split mode.
  await page.getByRole('button', { name: /Trayectoria/ }).click();
  await expect(executed(page)).toHaveCount(0);
  await page.getByRole('button', { name: /Trayectoria/ }).click();
  await expect(executed(page)).toHaveCount(done);

  await page.getByRole('button', { name: 'Vista 2D', exact: true }).click();
  await expect(canvas(page)).toHaveCount(0);
  await expect(plane(page)).toBeVisible();
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await expect(plane(page)).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '3');
  await expect(page.getByRole('button', { name: /Trayectoria/ })).toHaveCount(0);
  await expect(page.locator('.three-view [role=alert]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('3D to split keeps the same canvas and camera (no second WebGL context)', async ({ page }) => {
  await interpret(page);
  await page.getByRole('button', { name: 'Pieza 3D', exact: true }).click();
  await page.getByRole('button', { name: 'Ortográfica', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-camera', 'orthographic');
  await canvas(page).evaluate(el => { (el as HTMLCanvasElement & { splitMark?: boolean }).splitMark = true; });
  await page.getByRole('button', { name: 'Dividida', exact: true }).click();
  await expect(plane(page)).toBeVisible();
  await expect(canvas(page)).toHaveCount(1);
  expect(await canvas(page).evaluate(el => (el as HTMLCanvasElement & { splitMark?: boolean }).splitMark)).toBe(true);
  await expect(canvas(page)).toHaveAttribute('data-camera', 'orthographic');
  await next(page).click();
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '1');
});

test('split view stacks the 2D plane above the 3D part on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1100 });
  await interpret(page);
  await page.getByRole('button', { name: 'Dividida', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
  await next(page).click();
  await expect(canvas(page)).toHaveAttribute('data-profile-blocks', '1');
  await expect(page.getByTestId('block-count')).toContainText('1 /');
  const a = (await plane(page).boundingBox())!;
  const b = (await canvas(page).boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);
  expect(Math.abs(b.width - a.width)).toBeLessThan(4);
  expect(b.height).toBeGreaterThan(200);
  if (captures) await page.screenshot({ path: 'test-results/split-view-narrow.png', fullPage: true });
});
