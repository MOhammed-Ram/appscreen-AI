const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { normalizeSettings, saveSettings, loadSettings } = require('../../electron/settings-store');

function fileToDataUrl(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    return `data:${mime};base64,${content.toString('base64')}`;
}

const redDataUrl = fileToDataUrl(path.resolve(__dirname, '../fixtures/red.png'));
const blueDataUrl = fileToDataUrl(path.resolve(__dirname, '../fixtures/blue.png'));
const greenDataUrl = fileToDataUrl(path.resolve(__dirname, '../fixtures/green.png'));

async function clearStorage(page) {
    await page.goto('/index.html');
    await page.evaluate(async () => {
        localStorage.clear();
        await new Promise((resolve) => {
            const request = indexedDB.deleteDatabase('AppStoreScreenshotGenerator');
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    });
    await page.reload();
    await page.waitForFunction(() => !!window.__appscreenAutomation);
}

test.beforeEach(async ({ page }) => {
    await clearStorage(page);
});

test('upload/import and render path works', async ({ page }) => {
    const result = await page.evaluate(async ({ redDataUrl, blueDataUrl }) => {
        await window.__appscreenAutomation.resetProject({ name: 'Smoke Import' });
        await window.__appscreenAutomation.importLocalizedScreenshots([
            { name: 'screen-1_en.png', dataUrl: redDataUrl },
            { name: 'screen-1_de.png', dataUrl: blueDataUrl }
        ]);
        return window.__appscreenAutomation.renderAllPng({
            language: 'en',
            outputDevice: 'iphone-6.9'
        });
    }, { redDataUrl, blueDataUrl });

    expect(result.length).toBe(1);
    expect(result[0].filename).toBe('screenshot-1.png');
    expect(result[0].width).toBe(1320);
    expect(result[0].height).toBe(2868);
    expect(result[0].dataUrl.startsWith('data:image/png;base64,')).toBeTruthy();
});

test('multi-language render uses localized image variants', async ({ page }) => {
    const output = await page.evaluate(async ({ redDataUrl, blueDataUrl }) => {
        await window.__appscreenAutomation.resetProject({ name: 'Smoke Multi Lang' });
        await window.__appscreenAutomation.applyListingSpec({
            projectName: 'Smoke Multi Lang',
            languages: ['en', 'de'],
            screens: [
                {
                    id: 'screen-1',
                    images: {
                        en: redDataUrl,
                        de: blueDataUrl,
                        default: redDataUrl
                    }
                }
            ]
        });

        const enRender = await window.__appscreenAutomation.renderAllPng({ language: 'en', outputDevice: 'iphone-6.9' });
        const deRender = await window.__appscreenAutomation.renderAllPng({ language: 'de', outputDevice: 'iphone-6.9' });
        return {
            en: enRender[0].dataUrl,
            de: deRender[0].dataUrl
        };
    }, { redDataUrl, blueDataUrl });

    expect(output.en).not.toEqual(output.de);
});

test('background image survives save and reload', async ({ page }) => {
    const before = await page.evaluate(async ({ redDataUrl, greenDataUrl }) => {
        await window.__appscreenAutomation.resetProject({ name: 'Smoke Bg Persist' });
        await window.__appscreenAutomation.applyListingSpec({
            projectName: 'Smoke Bg Persist',
            languages: ['en'],
            screens: [
                {
                    id: 'screen-1',
                    images: { en: greenDataUrl, default: greenDataUrl },
                    style: {
                        background: {
                            type: 'image',
                            imageSrc: redDataUrl
                        }
                    }
                }
            ]
        });
        if (typeof flushStateSave === 'function') flushStateSave();
        return {
            imageSrc: getBackground().imageSrc,
            hasImage: !!getBackground().image
        };
    }, { redDataUrl, greenDataUrl });

    expect(before.imageSrc).toBe(redDataUrl);
    expect(before.hasImage).toBeTruthy();

    await page.reload();
    await page.waitForFunction(() => !!window.__appscreenAutomation);
    const after = await page.evaluate(() => ({
        imageSrc: getBackground().imageSrc,
        hasImage: !!getBackground().image
    }));

    expect(after.imageSrc).toBe(redDataUrl);
    expect(after.hasImage).toBeTruthy();
});

test('3D mode render exports non-empty PNG', async ({ page }) => {
    const result = await page.evaluate(async ({ redDataUrl }) => {
        await window.__appscreenAutomation.resetProject({ name: 'Smoke 3D' });
        await window.__appscreenAutomation.applyListingSpec({
            projectName: 'Smoke 3D',
            languages: ['en'],
            screens: [
                {
                    id: 'screen-1',
                    images: { en: redDataUrl, default: redDataUrl },
                    style: {
                        screenshot: {
                            use3D: true,
                            device3D: 'iphone',
                            rotation3D: { x: 5, y: -8, z: 0 }
                        }
                    }
                }
            ]
        });
        const rendered = await window.__appscreenAutomation.renderAllPng({ language: 'en', outputDevice: 'iphone-6.7' });
        return rendered[0];
    }, { redDataUrl });

    expect(result.width).toBe(1290);
    expect(result.height).toBe(2796);
    expect(result.dataUrl.length).toBeGreaterThan(5000);
});

test('project create/rename/delete flow remains functional', async ({ page }) => {
    const state = await page.evaluate(async () => {
        await window.__appscreenAutomation.resetProject({ name: 'Smoke Projects' });
        await createProject('Second Project');
        renameProject('Renamed Project');
        const beforeDelete = await window.__appscreenAutomation.healthCheck();
        await deleteProject();
        const afterDelete = await window.__appscreenAutomation.healthCheck();
        return {
            beforeDeleteCount: beforeDelete.projectCount,
            afterDeleteCount: afterDelete.projectCount,
            names: afterDelete.projectNames
        };
    });

    expect(state.beforeDeleteCount).toBeGreaterThan(1);
    expect(state.afterDeleteCount).toBe(state.beforeDeleteCount - 1);
    expect(state.names.length).toBeGreaterThan(0);
});

test('XSS regression: filename is rendered as text only', async ({ page }) => {
    const payloadName = '<img src=x onerror="window.__xss__=1">_en.png';
    const output = await page.evaluate(async ({ payloadName, redDataUrl }) => {
        window.__xss__ = 0;
        await window.__appscreenAutomation.resetProject({ name: 'Smoke XSS' });
        await window.__appscreenAutomation.importLocalizedScreenshots([
            { name: payloadName, dataUrl: redDataUrl }
        ]);
        const el = document.querySelector('.screenshot-name');
        return {
            html: el ? el.innerHTML : '',
            text: el ? el.textContent : '',
            xss: window.__xss__ || 0
        };
    }, { payloadName, redDataUrl });

    expect(output.text).toContain('_en.png');
    expect(output.html.includes('<img')).toBeFalsy();
    expect(output.xss).toBe(0);
});

test('Electron settings normalization handles special characters safely', async () => {
    const tempSettingsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'appscreen-settings-')), 'settings.json');
    const normalized = normalizeSettings({
        provider: 'openai',
        anthropicKey: "line1\nline2`'\"",
        openaiKey: "sk-abc`def'ghi\"jkl",
        googleKey: "AIza\nvalue",
        anthropicModel: 'claude-sonnet',
        openaiModel: 'gpt-5-mini',
        googleModel: 'gemini-2.5-flash'
    });

    expect(normalized.provider).toBe('openai');
    expect(normalized.anthropicKey).toContain('\n');
    expect(normalized.openaiKey).toContain('`');
    expect(normalized.googleKey).toContain('AIza');

    saveSettings(tempSettingsPath, normalized);
    const loaded = loadSettings(tempSettingsPath);
    expect(loaded.anthropicKey).toBe(normalized.anthropicKey);
    expect(loaded.openaiKey).toBe(normalized.openaiKey);
    expect(loaded.googleKey).toBe(normalized.googleKey);
});
