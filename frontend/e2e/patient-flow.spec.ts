import { test, expect } from '@playwright/test';

test.describe('Patient Flow', () => {
  test('can navigate from landing to login', async ({ page }) => {
    await page.goto('/');
    const loginLink = page.getByRole('link', { name: /sign in|login|log in/i });
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });
});

test.describe('Doctor Flow', () => {
  test('doctor page redirects unauthenticated', async ({ page }) => {
    await page.goto('/doctor/patient/anything');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Admin Flow', () => {
  test('admin page redirects unauthenticated', async ({ page }) => {
    await page.goto('/admin/audit');
    await expect(page).toHaveURL(/\/login/);
  });
});
