import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const paths = ['/login', '/plataforma/dashboard'];

for (const path of paths) {
  test(`${path} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

    expect(results.violations).toEqual([]);
  });
}
