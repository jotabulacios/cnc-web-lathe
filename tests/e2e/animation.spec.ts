import { test, expect, type Page } from '@playwright/test';

// Blocks: 1 G21, 2 S/M03, 3 G00 approach, 4 G01 feed along Z (22 mm), 5 G00 retract, 6 M30.
const program = 'G21 G18 G98\nS900 M03\nG00 X46 Z2\nG01 Z-20 F100\nG00 X60 Z5\nM30';
type Watch = { __sawAnimating: boolean };

const next = (page: Page) => page.getByRole('button', { name: 'Siguiente bloque', exact: true });
const marker = (page: Page) => page.getByTestId('tool-marker');
const toggle = (page: Page) => page.getByRole('checkbox', { name: 'Animar trayectoria' });
const tip = (page: Page) => marker(page).locator('circle').evaluate(c => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]);

async function at(page: Page, cursor: number) {
  await expect(page.getByTestId('block-count')).toHaveText(`${cursor} / 6`);
  await expect(page.getByTestId('profile-status')).toHaveText(`Perfil actualizado · bloque ${cursor}`);
}
async function load(page: Page) {
  await page.getByRole('textbox', { name: 'Programa G-code' }).fill(program);
  await page.getByRole('button', { name: /Interpretar programa/ }).click();
  await at(page, 0);
}
async function stepTo(page: Page, cursor: number) {
  const start = Number((await page.getByTestId('block-count').textContent())!.split(' / ')[0]);
  for (let i = start + 1; i <= cursor; i++) {
    await next(page).click();
    await at(page, i);
  }
  await expect(marker(page)).toHaveAttribute('data-animating', 'false');
}
/** Records, on every animation frame, whether any view reports an animation. */
async function watchAnimating(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Watch;
    w.__sawAnimating = false;
    const loop = () => {
      if (document.querySelector('[data-animating="true"]')) w.__sawAnimating = true;
      requestAnimationFrame(loop);
    };
    loop();
  });
}
const sawAnimating = (page: Page) => page.evaluate(() => (window as unknown as Watch).__sawAnimating);
/** Positions reached with the animation disabled: the reference end state of each block. */
async function referenceTips(page: Page) {
  await toggle(page).uncheck();
  const tips: number[][] = [await tip(page)];
  for (let i = 1; i <= 5; i++) { await stepTo(page, i); tips.push(await tip(page)); }
  await page.getByRole('button', { name: 'Reiniciar ejecución' }).click();
  await at(page, 0);
  await toggle(page).check();
  return tips;
}

test('a forward step travels along the block path and ends exactly at the resolved tip', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto('./');
  await load(page);
  await expect(toggle(page)).toBeChecked();
  const reference = await referenceTips(page);
  expect(reference[4]).not.toEqual(reference[3]);
  await stepTo(page, 3);
  expect(await tip(page)).toEqual(reference[3]);
  const dro = [await page.getByTestId('dro-x').textContent(), await page.getByTestId('dro-z').textContent()];

  // Freeze the virtual clock: the step is applied but the travel waits for animation frames.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
  await next(page).click();
  await expect(page.getByTestId('block-count')).toHaveText('4 / 6');
  await expect(marker(page)).toHaveAttribute('data-animating', 'true');
  // The DRO already shows the block's resolved state while the tool is still travelling.
  await expect(page.getByTestId('dro-z')).toHaveText('-20.000');
  expect(dro).toEqual(['46.000', '2.000']);
  expect(await tip(page)).toEqual(reference[3]);
  // Advance the virtual clock frame by frame (React schedules each hop between frames).
  await expect.poll(async () => { await page.clock.runFor(16); return (await tip(page))[0]; }).toBeLessThan(reference[3][0]);
  await expect(marker(page)).toHaveAttribute('data-animating', 'true');
  const middle = await tip(page);
  expect(middle[1]).toBeCloseTo(reference[3][1], 3); // G01 Z-20 keeps X: same SVG y
  expect(middle[0]).toBeGreaterThan(reference[4][0]);
  await expect.poll(async () => { await page.clock.runFor(100); return marker(page).getAttribute('data-animating'); }).toBe('false');
  expect(await tip(page)).toEqual(reference[4]);
  await page.clock.resume();
  await at(page, 4);
  expect(errors).toEqual([]);
});

test('rewind and reset jump without animating; forward steps do animate', async ({ page }) => {
  await page.goto('./');
  await load(page);
  const reference = await referenceTips(page);
  await watchAnimating(page);
  await next(page).click();
  await next(page).click();
  await next(page).click();
  await expect.poll(() => sawAnimating(page)).toBe(true);
  await stepTo(page, 4);
  expect(await tip(page)).toEqual(reference[4]);

  await watchAnimating(page);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await at(page, 3);
  expect(await tip(page)).toEqual(reference[3]);
  await page.waitForTimeout(700);
  expect(await sawAnimating(page)).toBe(false);
  await page.getByRole('button', { name: 'Reiniciar ejecución' }).click();
  await at(page, 0);
  expect(await tip(page)).toEqual(reference[0]);
  await page.waitForTimeout(700);
  expect(await sawAnimating(page)).toBe(false);
});

test('turning the animation off jumps; the toggle is presentation only', async ({ page }) => {
  await page.goto('./');
  await load(page);
  const reference = await referenceTips(page);
  await toggle(page).uncheck();
  await watchAnimating(page);
  for (let i = 1; i <= 5; i++) {
    await next(page).click();
    await at(page, i);
    expect(await tip(page)).toEqual(reference[i]);
  }
  await page.waitForTimeout(700);
  expect(await sawAnimating(page)).toBe(false);
  await expect(page.getByTestId('dro-x')).toHaveText('60.000');
  await expect(page.getByTestId('dro-z')).toHaveText('5.000');
});

test('prefers-reduced-motion jumps even with the toggle on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await load(page);
  await expect(toggle(page)).toBeChecked();
  const reference = await referenceTips(page);
  await watchAnimating(page);
  for (let i = 1; i <= 5; i++) {
    await next(page).click();
    await at(page, i);
    expect(await tip(page)).toEqual(reference[i]);
  }
  await page.waitForTimeout(700);
  expect(await sawAnimating(page)).toBe(false);
});

test('the 3D tool animates on a forward step and settles on the resolved tip', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await load(page);
  await page.getByRole('button', { name: 'Pieza 3D' }).click();
  const canvas = page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-animating', 'false');
  await stepTo3D(page, 3);
  await watchAnimating(page);
  await next(page).click();
  await expect.poll(() => sawAnimating(page)).toBe(true);
  await expect(canvas).toHaveAttribute('data-animating', 'false');
  await at(page, 4);
  await expect(canvas).toHaveAttribute('data-tool-x', '46');
  await expect(canvas).toHaveAttribute('data-tool-z', '-20');
  await watchAnimating(page);
  await page.getByRole('button', { name: '← Anterior', exact: true }).click();
  await at(page, 3);
  await expect(canvas).toHaveAttribute('data-tool-z', '2');
  await page.waitForTimeout(700);
  expect(await sawAnimating(page)).toBe(false);
  await expect(canvas).toHaveAttribute('data-animating', 'false');
  expect(errors).toEqual([]);
});

async function stepTo3D(page: Page, cursor: number) {
  for (let i = 1; i <= cursor; i++) { await next(page).click(); await at(page, i); }
  await expect(page.getByRole('img', { name: 'Pieza de torno en 3D', exact: true })).toHaveAttribute('data-animating', 'false');
}
