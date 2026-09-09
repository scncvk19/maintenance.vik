import { test, expect } from '@playwright/test';

test('Bestand, Wartung, Finanzen, Dokumente und Backup über die Oberfläche', async ({ page, request }) => {
  const assetName = 'E2E Servicewagen ' + Date.now();
  const baseline = await request.get('/api/backup/export');
  expect(baseline.ok()).toBeTruthy();
  const baselineBytes = await baseline.body();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('/');
    await expect(page.getByRole('heading', {name:'Alles im Blick.'})).toBeVisible();
    await page.getByRole('button', {name:'Asset anlegen', exact:true}).click();
    await page.getByLabel('Bezeichnung', {exact:true}).fill(assetName);
    await page.getByLabel('Asset-Typ').selectOption('vehicle');
    await page.getByLabel('Standort / Adresse').fill('Testgarage');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', {name:'Assets', exact:true}).click();
    await expect(page.getByRole('cell', {name:assetName, exact:true})).toBeVisible();
    await page.reload();
    await expect(page.getByRole('cell', {name:assetName, exact:true})).toBeVisible();
    await page.getByRole('button', {name:assetName + ' bearbeiten'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Zustand', {exact:true}).selectOption('attention');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:assetName})).toContainText('Beobachten');

    await page.getByRole('button', {name:'Wartungen', exact:true}).click();
    await page.getByRole('button', {name:'Eintrag anlegen'}).click();
    await page.getByLabel('Asset', {exact:true}).selectOption({label:assetName});
    await page.getByLabel('Titel', {exact:true}).fill('E2E Ölwechsel');
    await page.getByLabel('Wiederholung in Tagen (optional)').fill('90');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', {name:'E2E Ölwechsel bearbeiten'}).click();
    await page.getByLabel('Status', {exact:true}).selectOption('done');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('cell', {name:'E2E Ölwechsel Wartung'})).toHaveCount(1);
    await page.getByRole('button', {name:'Historie / Erledigt'}).click();
    await expect(page.getByRole('row').filter({hasText:'E2E Ölwechsel'})).toContainText('Erledigt');

    await page.getByRole('button', {name:'Einnahmen & Ausgaben', exact:true}).click();
    await page.getByRole('button', {name:'Eintrag anlegen'}).click();
    await page.getByLabel('Asset', {exact:true}).selectOption({label:assetName});
    await page.getByLabel('Titel', {exact:true}).fill('E2E Werkstatt');
    await page.getByLabel('Betrag in EUR').fill('123.45');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:'E2E Werkstatt'})).toContainText('123,45');

    await page.getByRole('button', {name:'Dokumente', exact:true}).click();
    await page.getByRole('button', {name:'Dokument hochladen', exact:true}).click();
    await page.getByLabel('Asset', {exact:true}).selectOption({label:assetName});
    await page.getByLabel('Titel', {exact:true}).fill('E2E Rechnung');
    await page.getByLabel('Datei auswählen').setInputFiles({name:'rechnung.txt',mimeType:'text/plain',buffer:Buffer.from('Testrechnung 123,45 EUR')});
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:'E2E Rechnung'})).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', {name:'E2E Rechnung herunterladen'}).click();
    expect((await downloadPromise).suggestedFilename()).toBe('rechnung.txt');
    await page.getByRole('button', {name:'E2E Rechnung bearbeiten'}).click();
    await page.getByLabel('Kategorie', {exact:true}).selectOption('repair');
    await page.getByRole('button', {name:'Speichern', exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('row').filter({hasText:'E2E Rechnung'})).toContainText('Reparatur');

    await page.getByRole('button', {name:'Einstellungen & Backup', exact:true}).click();
    const backupDownload = page.waitForEvent('download');
    await page.getByRole('button', {name:'Backup exportieren'}).click();
    expect((await backupDownload).suggestedFilename()).toContain('maintenance-vik-');
    await page.locator('input[type=file]').setInputFiles({name:'baseline.zip',mimeType:'application/zip',buffer:baselineBytes});
    await expect(page.getByRole('heading', {name:'Backup geprüft'})).toBeVisible();
    await expect(page.getByRole('button', {name:'Gesamten Bestand ersetzen'})).toBeDisabled();
    await page.getByLabel('Zum Ersetzen WIEDERHERSTELLEN eingeben').fill('WIEDERHERSTELLEN');
    await page.getByRole('button', {name:'Gesamten Bestand ersetzen'}).click();
    await expect(page.getByRole('status')).toContainText('Backup erfolgreich wiederhergestellt.');
    await page.getByRole('button', {name:'Assets', exact:true}).click();
    await expect(page.getByText(assetName, {exact:true})).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    const restore = await request.post('/api/backup/import', {multipart:{confirmation:'WIEDERHERSTELLEN',file:{name:'baseline.zip',mimeType:'application/zip',buffer:baselineBytes}}});
    expect(restore.ok()).toBeTruthy();
  }
});

test('Drei Designs, persistente Auswahl und mobile Navigation', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('/');
  await expect(page.getByRole('heading', {name:'Dein Bestand',exact:true})).toBeVisible();
  for (const theme of ['light','dark']) {
    await page.getByLabel('Design', {exact:true}).selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
    await page.screenshot({path:`test-results/desktop-${theme}.png`,fullPage:true});
  }
  await page.reload();
  await expect(page.getByLabel('Design',{exact:true})).toHaveValue('dark');
  await expect(page.getByRole('heading', {name:'Dein Bestand',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('Design',{exact:true}).selectOption('light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Menü öffnen'}).click();
  await page.getByRole('button',{name:'Assets',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Assets',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Eintrag anlegen'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:'test-results/mobile-form.png',fullPage:true});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
