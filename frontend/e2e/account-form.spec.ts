import { test, expect } from '@playwright/test';

test('account form actions work on the first click when an empty field loses focus', async ({ page }, testInfo) => {
  const zh = testInfo.project.name === 'mobile';
  const label = (en: string, cn: string) => zh ? cn : en;
  await page.goto('/?mode=api#player');
  await page.getByRole('button', { name: zh ? '中文' : 'English', exact: true }).click();
  await page.getByRole('button', { name: label('Track this game', '记录这款游戏'), exact: true }).click();
  const identifier = page.getByRole('textbox', { name: label('User ID or email', '用户 ID 或邮箱'), exact: true });
  await expect(identifier).toBeFocused();

  // A real pointer click includes blur between press/release; JSDOM click events
  // do not catch validation messages moving the intended button during that click.
  await page.getByRole('button', { name: label('Create Account', '注册账号'), exact: true }).click({ delay: 80 });
  const email = page.getByRole('textbox', { name: label('Register email', '注册邮箱'), exact: true });
  await expect(email).toBeVisible({ timeout: 2_000 });
  await expect(email).toBeFocused();
  await page.getByRole('button', { name: label('Already have an account? Sign in', '已有账号？登录'), exact: true }).click({ delay: 80 });
  await expect(identifier).toBeVisible();
  await expect(identifier).toBeFocused();

  await page.getByRole('button', { name: label('Sign In', '登录'), exact: true }).click({ delay: 80 });
  await expect(page.getByText(label('Enter your user ID or email.', '请输入用户 ID 或邮箱。'), { exact: true })).toBeVisible();
  await expect(page.getByText(label('Enter your password.', '请输入密码。'), { exact: true })).toBeVisible();
  await expect(identifier).toBeFocused();

  await page.getByRole('button', { name: label('Create Account', '注册账号'), exact: true }).click();
  await expect(email).toBeFocused();
  await page.getByRole('button', { name: label('Cancel', '取消'), exact: true }).click({ delay: 80 });
  await expect(email).toHaveCount(0);
  await expect(page.getByRole('button', { name: label('Sign In', '登录'), exact: true })).toBeVisible();
});
