// Real layout regression using synthetic labels; never reads account data.
// Set QA_BASE to the production origin to verify the deployed CSS as well.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.QA_BASE || 'http://127.0.0.1:5173';
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const theme of ['dark', 'light']) for (const width of [320, 390, 768, 900, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/?demo=1&view=profile&theme=${theme}`);
    await page.locator('.pf-cmd').first().waitFor();
    const rows = await page.evaluate(() => {
      const names = ['exec_command', 'apply_patch', 'write_stdin', 'exec', 'shell',
        'shell_command', 'update_plan', 'WebSearch', 'mcp__example__long_tool_name_with_extra_context'];
      const existing = [...document.querySelectorAll('.pf-cmd')];
      const template = existing[0].cloneNode(true);
      const parent = existing[0].parentElement;
      existing.forEach(row => row.remove());
      names.forEach((name, i) => {
        const row = template.cloneNode(true);
        row.querySelector('code').textContent = name;
        row.querySelector('span').textContent = i === 0 ? '1,234,567' : '15,143';
        parent.append(row);
      });
      return [...document.querySelectorAll('.pf-cmd')].map(row => {
        const label = row.querySelector('code'), bar = row.querySelector('.tbar'), count = row.querySelector('span');
        const text = document.createRange(); text.selectNodeContents(label);
        const b = bar.getBoundingClientRect(), c = count.getBoundingClientRect();
        return { name: label.textContent, textRight: Math.max(...[...text.getClientRects()].map(r => r.right)),
          barLeft: b.left, barRight: b.right, countLeft: c.left, barWidth: b.width,
          overflow: row.scrollWidth > row.clientWidth + 1 };
      });
    });
    for (const row of rows) {
      assert.ok(row.textRight <= row.barLeft - 8, `${theme} ${width}px: ${row.name} overlaps its bar`);
      assert.ok(row.barRight <= row.countLeft - 8, `${theme} ${width}px: bar overlaps count`);
      assert.ok(row.barWidth >= 24, `${theme} ${width}px: bar too narrow`);
      assert.ok(Math.abs(row.barWidth - rows[0].barWidth) < 1, `${theme} ${width}px: inconsistent bar scales`);
      assert.equal(row.overflow, false, `${theme} ${width}px: overflowing row`);
    }
    if (theme === 'dark' && [390, 1440].includes(width)) {
      await page.locator('.pf-pattern').screenshot({ path: `/private/tmp/rexy-profile-tools-${width}.png` });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ themes: 2, viewport_widths: 6, rows_checked: 108, label_bar_count_overlap: 0, page_errors: 0 }));
} finally { await browser.close(); }
