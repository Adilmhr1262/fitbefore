/* FitBefore verification suite (headless Firefox via playwright-core). */
const { firefox } = require('/home/hatch/workspace/goals/ship-one-project-per-day/hidden_files/test-tools/node_modules/playwright-core');
const fs = require('fs');

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await firefox.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  const extRequests = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR: ' + e.message); });
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:8141')) extRequests.push(r.url()); });

  await page.goto('http://127.0.0.1:8141/index.html');
  await page.waitForSelector('#addSpaceBtn');
  await sleep(300);

  check('page title', (await page.title()) === 'FitBefore — Will it fit?');
  check('spaces empty state visible', await page.isVisible('#spaceEmpty'));
  check('items empty state visible (furniture tab hidden, empty div present)', (await page.textContent('#itemEmpty')).includes('No furniture yet'));
  await page.click('#tabFit');
  await sleep(200);
  check('fit empty state visible', await page.isVisible('#fitEmpty'));
  check('print button disabled when nothing to compare', await page.isDisabled('#printFitBtn'));
  await page.click('#tabSpaces');
  await sleep(200);

  async function addSpace(name, w, d, h) {
    await page.click('#addSpaceBtn');
    await page.waitForSelector('#dialog[open]');
    await page.fill('#fName', name);
    await page.fill('#fW', String(w));
    await page.fill('#fD', String(d));
    if (h != null) await page.fill('#fH', String(h));
    await page.click('#dialogConfirm');
    await sleep(300);
  }
  async function addItem(name, w, d, h, link, notes) {
    await page.click('#tabFurniture');
    await sleep(200);
    await page.click('#addItemBtn');
    await page.waitForSelector('#dialog[open]');
    await page.fill('#fName', name);
    await page.fill('#fW', String(w));
    await page.fill('#fD', String(d));
    if (h != null) await page.fill('#fH', String(h));
    if (link) await page.fill('#fLink', link);
    if (notes) await page.fill('#fNotes', notes);
    await page.click('#dialogConfirm');
    await sleep(300);
  }

  // Empty name rejected, dialog stays open
  await page.click('#addSpaceBtn');
  await page.waitForSelector('#dialog[open]');
  await page.fill('#fW', '100');
  await page.fill('#fD', '50');
  await page.click('#dialogConfirm');
  await sleep(200);
  check('empty space name rejected, dialog stays open', await page.isVisible('#dialog[open]') && await page.isVisible('#dialogError'));
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes dialog', !(await page.isVisible('#dialog[open]')));

  // Invalid width rejected
  await page.click('#addSpaceBtn');
  await page.waitForSelector('#dialog[open]');
  await page.fill('#fName', 'Bad space');
  await page.fill('#fW', '0');
  await page.fill('#fD', '50');
  await page.click('#dialogConfirm');
  await sleep(200);
  check('zero width rejected', await page.isVisible('#dialogError'));
  await page.keyboard.press('Escape');
  await sleep(200);

  // Add spaces
  await addSpace('Desk alcove', 120, 60, 75);
  await addSpace('Shelf opening', 80, 30, null);
  check('two spaces listed', (await page.textContent('#spaceList')).includes('Desk alcove') && (await page.textContent('#spaceList')).includes('Shelf opening'));
  check('space dims shown in cm', (await page.textContent('#spaceList')).includes('120 cm W × 60 cm D × 75 cm H'));
  check('space without height omits H', (await page.textContent('#spaceList')).includes('80 cm W × 30 cm D') && !(await page.textContent('#spaceList')).includes('80 cm W × 30 cm D ×'));

  // Search filters spaces
  await page.fill('#spaceSearch', 'desk');
  await sleep(200);
  check('space search filters to 1', (await page.textContent('#spaceList')).includes('Desk alcove') && !(await page.textContent('#spaceList')).includes('Shelf opening'));
  await page.fill('#spaceSearch', '');
  await sleep(200);

  // Add items
  await addItem('Oak desk', 110, 55, 72, 'https://example.com/desk', 'Light oak');
  await addItem('<img src=x onerror=alert(1)>', 40, 40, null, '', '');
  check('item with link and notes listed', (await page.textContent('#itemList')).includes('Oak desk') && (await page.textContent('#itemList')).includes('Light oak'));
  check('item link rendered as link', (await page.getAttribute('#itemList a', 'href')) === 'https://example.com/desk');
  check('XSS markup renders as plain text', (await page.textContent('#itemList')).includes('<img src=x onerror=alert(1)>') && errors.length === 0);

  // Unit conversion to inches
  await page.click('#unitIn');
  await sleep(300);
  const spaceTextIn = await page.textContent('#spaceList');
  check('inch display converts (120 cm = 47.24 in)', spaceTextIn.includes('47.24 in W'));
  await page.click('#unitCm');
  await sleep(300);

  // Fit check: fits, tight on height (75-72 = 3 cm < 5 cm)
  await page.click('#tabFit');
  await sleep(300);
  check('fit panel shown, print enabled', await page.isVisible('#fitMain') && !(await page.isDisabled('#printFitBtn')));
  await page.selectOption('#fitSpace', { index: 0 });
  await page.selectOption('#fitItem', { index: 0 });
  await sleep(300);
  check('verdict Fits — tight (height clearance 3 cm)', (await page.textContent('#fitVerdict')) === 'Fits — tight');
  const dimsText = await page.textContent('#dimRows');
  check('width clearance +10 cm', dimsText.includes('+10 cm'));
  check('depth clearance +5 cm', dimsText.includes('+5 cm'));
  check('height clearance +3 cm', dimsText.includes('+3 cm'));
  check('tight badge on height row', (await page.locator('.clearance-tight').count()) === 1);

  // Diagram present and scaled
  const rects = await page.locator('#fitSvg rect').count();
  check('diagram has space + item rects', rects === 2, 'rects=' + rects);
  check('diagram aria-label names verdict', (await page.getAttribute('#fitSvg', 'aria-label')).includes('Fits — tight'));

  // Rotate: 55 W x 110 D into 120 x 60 -> depth excess -50 cm
  await page.check('#fitRotate');
  await sleep(300);
  check('rotated verdict Does not fit', (await page.textContent('#fitVerdict')) === 'Does not fit');
  check('rotated depth excess -50 cm', (await page.textContent('#dimRows')).includes('-50 cm'));
  await page.uncheck('#fitRotate');
  await sleep(300);
  check('unrotated back to Fits — tight', (await page.textContent('#fitVerdict')) === 'Fits — tight');

  // Height not compared when one side lacks it: pick Shelf opening (no H) + Oak desk
  await page.selectOption('#fitSpace', { index: 1 });
  await sleep(300);
  check('height row says not compared', (await page.textContent('#dimRows')).includes('Not compared'));
  check('height note explains why', (await page.textContent('#fitHeightNote')).includes('no height recorded'));
  check('verdict with missing height is Does not fit (110 > 80 width)', (await page.textContent('#fitVerdict')) === 'Does not fit');
  await page.selectOption('#fitSpace', { index: 0 });
  await sleep(300);

  // Edit item width to 125 -> does not fit
  await page.click('#tabFurniture');
  await sleep(200);
  const cards = page.locator('#itemList .card');
  await cards.first().locator('button', { hasText: 'Edit' }).click();
  await page.waitForSelector('#dialog[open]');
  await page.fill('#fW', '125');
  await page.click('#dialogConfirm');
  await sleep(300);
  await page.click('#tabFit');
  await sleep(300);
  check('edited width 125 exceeds space: Does not fit', (await page.textContent('#fitVerdict')) === 'Does not fit');
  check('width excess -5 cm', (await page.textContent('#dimRows')).includes('-5 cm'));
  // revert
  await page.click('#tabFurniture');
  await sleep(200);
  await page.locator('#itemList .card').first().locator('button', { hasText: 'Edit' }).click();
  await page.waitForSelector('#dialog[open]');
  await page.fill('#fW', '110');
  await page.click('#dialogConfirm');
  await sleep(300);

  // Delete a space with confirm dialog
  await page.click('#tabSpaces');
  await sleep(200);
  await page.locator('#spaceList .card').nth(1).locator('button', { hasText: 'Delete' }).click();
  await page.waitForSelector('#dialog[open]');
  await page.click('#dialogConfirm');
  await sleep(300);
  check('space deleted (1 left)', !(await page.textContent('#spaceList')).includes('Shelf opening'));

  // Persistence across reload
  await page.reload();
  await page.waitForSelector('#addSpaceBtn');
  await sleep(300);
  check('data persists after reload', (await page.textContent('#spaceList')).includes('Desk alcove'));
  await page.click('#tabFurniture');
  await sleep(200);
  check('items persist after reload', (await page.textContent('#itemList')).includes('Oak desk'));

  // Export: capture download, validate content
  const dl = page.waitForEvent('download');
  await page.click('#exportBtn');
  const download = await dl;
  const dlPath = '/tmp/fitbefore-export.json';
  await download.saveAs(dlPath);
  const exported = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  check('export is fitbefore backup, 1 space 2 items', exported.app === 'fitbefore' && exported.version === 1 && exported.spaces.length === 1 && exported.items.length === 2,
    'spaces=' + exported.spaces.length + ' items=' + exported.items.length);

  // Import: invalid JSON rejected, data unchanged
  fs.writeFileSync('/tmp/fitbefore-bad.json', '{"app":"fitbefore","spaces":"nope"}');
  await page.setInputFiles('#importFile', '/tmp/fitbefore-bad.json');
  await sleep(400);
  check('invalid backup rejected with toast', (await page.textContent('#toastRoot')).includes('Import rejected'));
  check('data unchanged after rejected import', (await page.textContent('#itemList')).includes('Oak desk'));

  // Import: duplicate ids rejected
  const dup = { app: 'fitbefore', version: 1, spaces: [{ id: 'x', name: 'A', width: 10, depth: 10, height: null }, { id: 'x', name: 'B', width: 10, depth: 10, height: null }], items: [] };
  fs.writeFileSync('/tmp/fitbefore-dup.json', JSON.stringify(dup));
  await page.setInputFiles('#importFile', '/tmp/fitbefore-dup.json');
  await sleep(400);
  check('duplicate-id backup rejected', (await page.textContent('#toastRoot')).includes('Import rejected'));

  // Import: valid backup replaces data (confirm dialog)
  const good = { app: 'fitbefore', version: 1, unit: 'cm', spaces: [{ id: 'imp-s1', name: 'Imported nook', width: 100, depth: 50, height: null }], items: [{ id: 'imp-i1', name: 'Imported chair', width: 45, depth: 45, height: 80, link: '', notes: '' }] };
  fs.writeFileSync('/tmp/fitbefore-good.json', JSON.stringify(good));
  await page.setInputFiles('#importFile', '/tmp/fitbefore-good.json');
  await page.waitForSelector('#dialog[open]');
  await page.click('#dialogConfirm');
  await sleep(400);
  await page.click('#tabSpaces');
  await sleep(200);
  check('valid import replaced spaces', (await page.textContent('#spaceList')).includes('Imported nook') && !(await page.textContent('#spaceList')).includes('Desk alcove'));

  // Dialog focus trap: Tab stays inside dialog
  await page.click('#addSpaceBtn');
  await page.waitForSelector('#dialog[open]');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const activeInDialog = await page.evaluate(() => { const d = document.getElementById('dialog'); return d.contains(document.activeElement); });
  check('Tab focus stays inside dialog', activeInDialog);
  await page.keyboard.press('Escape');
  await sleep(200);

  // Print media: toast root + nav hidden
  await page.emulateMedia({ media: 'print' });
  await sleep(200);
  const toastDisplay = await page.evaluate(() => getComputedStyle(document.getElementById('toastRoot')).display);
  check('toast root hidden in print media', toastDisplay === 'none', toastDisplay);
  const tabsDisplay = await page.evaluate(() => getComputedStyle(document.querySelector('.tabs')).display);
  check('tabs hidden in print media', tabsDisplay === 'none', tabsDisplay);
  await page.emulateMedia({ media: 'screen' });

  // Mobile 375px: no horizontal overflow, controls stack
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click('#tabFit');
  await sleep(300);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check('375px no horizontal overflow', !overflow);
  const stacked = await page.evaluate(() => {
    const r = document.querySelector('.fit-layout').getBoundingClientRect();
    return r.width < 500;
  });
  check('375px fit layout is single column', stacked);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Network audit + page errors
  check('zero external requests', extRequests.length === 0, extRequests.join(', '));
  check('zero uncaught page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SUITE ERROR: ' + (e && e.stack || e)); process.exit(2); });
