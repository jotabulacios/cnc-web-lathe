import type { Locator, Page } from '@playwright/test';

/** Right-hand workbench tabs. Inactive panels are `hidden`, so select the tab before interacting. */
export type WorkbenchTab = 'Programa' | 'Pieza' | 'Herramientas' | 'Explicación' | 'Prácticas';

/** The Programa tab name gains an error badge ("Programa2 errores"), so match it by prefix. */
export const tabButton = (page: Page, name: WorkbenchTab): Locator =>
  name === 'Programa'
    ? page.getByRole('tab', { name: /^Programa/ })
    : page.getByRole('tab', { name, exact: true });

export const tab = (page: Page, name: WorkbenchTab) => tabButton(page, name).click();

