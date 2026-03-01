#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'mcp_antigravity_debug.log');
function logDebug(msg) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
}
logDebug('--- SERVER START ---');
logDebug(`Node path: ${process.execPath}`);
logDebug(`Cwd: ${process.cwd()}`);
logDebug(`Env APPSCREEN_ROOT: ${process.env.APPSCREEN_ROOT}`);

process.on('uncaughtException', (err) => {
    logDebug(`UNCAUGHT: ${err.stack || err}`);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    logDebug(`UNHANDLED REJECTION: ${reason.stack || reason}`);
    process.exit(1);
});

logDebug('Requiring http...');
const http = require('http');
logDebug('Requiring crypto...');
const crypto = require('crypto');
logDebug('Requiring playwright...');
const { chromium } = require('playwright');
logDebug('Requiring zod...');
const { z } = require('zod');
logDebug('Requiring mcp sdk server...');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
logDebug('Requiring mcp sdk stdio...');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
logDebug('Requiring mcp sdk types...');
const {
    ListToolsRequestSchema,
    CallToolRequestSchema
} = require('@modelcontextprotocol/sdk/types.js');
logDebug('All requires finished.');

const APP_ROOT = path.resolve(__dirname, '..');
const MCP_DEFAULT_TIMEOUT_MS = 120000;
const MCP_BOOTSTRAP_TIMEOUT_MS = MCP_DEFAULT_TIMEOUT_MS;
const MAX_COMBOS_PER_SESSION = 4;

const OUTPUT_PRESETS = {
    'iphone-6.9': { width: 1320, height: 2868 },
    'iphone-6.7': { width: 1290, height: 2796 },
    'iphone-6.5': { width: 1284, height: 2778 },
    'iphone-5.5': { width: 1242, height: 2208 },
    'ipad-12.9': { width: 2048, height: 2732 },
    'ipad-11': { width: 1668, height: 2388 },
    'android-phone': { width: 1080, height: 1920 },
    'android-phone-hd': { width: 1440, height: 2560 },
    'android-tablet-7': { width: 1200, height: 1920 },
    'android-tablet-10': { width: 1600, height: 2560 }
};

const EXAMPLE_LISTING_SPEC = {
    projectName: 'Example Listing Job',
    outputDevices: ['iphone-6.9', 'android-phone'],
    languages: ['en', 'de'],
    screens: [
        {
            id: 'screen-1',
            images: {
                en: 'fixtures/screen1-en.png',
                de: 'fixtures/screen1-de.png',
                default: 'fixtures/screen1-en.png'
            },
            text: {
                headline: { en: 'Track Everything', de: 'Alles im Blick' },
                subheadline: { en: 'Fast and simple', de: 'Schnell und einfach' }
            }
        }
    ],
    outputMode: 'app-dir',
    outputDir: 'img/generated-listings',
    allowPartial: false
};

const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

const listingScreenSchema = z.object({
    id: z.string().min(1),
    images: z.record(z.string().min(1)),
    text: z.object({
        headline: z.record(z.string()).optional(),
        subheadline: z.record(z.string()).optional()
    }).optional(),
    style: z.object({
        background: z.object({
            type: z.enum(['solid', 'gradient', 'image']).optional(),
            solid: z.string().optional(),
            gradient: z.object({
                angle: z.number().optional(),
                stops: z.array(z.object({
                    color: z.string(),
                    position: z.number()
                })).optional()
            }).optional(),
            imageSrc: z.string().nullable().optional(),
            imageFit: z.enum(['cover', 'contain', 'stretch']).optional(),
            imageBlur: z.number().optional(),
            overlayColor: z.string().optional(),
            overlayOpacity: z.number().optional(),
            noise: z.boolean().optional(),
            noiseIntensity: z.number().optional()
        }).passthrough().optional(),
        screenshot: z.object({
            scale: z.number().optional(),
            x: z.number().optional(),
            y: z.number().optional(),
            rotation: z.number().optional(),
            perspective: z.number().optional(),
            cornerRadius: z.number().optional(),
            use3D: z.boolean().optional(),
            device3D: z.enum(['iphone', 'android']).optional(),
            rotation3D: z.object({
                x: z.number(),
                y: z.number(),
                z: z.number()
            }).optional(),
            shadow: z.object({
                enabled: z.boolean().optional(),
                color: z.string().optional(),
                blur: z.number().optional(),
                opacity: z.number().optional(),
                x: z.number().optional(),
                y: z.number().optional()
            }).optional(),
            frame: z.object({
                enabled: z.boolean().optional(),
                color: z.string().optional(),
                width: z.number().optional(),
                opacity: z.number().min(0).max(100).optional()
            }).optional(),
            deviceFrame: z.object({
                enabled: z.boolean().optional(),
                type: z.enum(['iphone', 'android', 'ipad']).optional(),
                colorScheme: z.enum(['dark', 'light', 'custom']).optional(),
                customColor: z.string().optional()
            }).optional()
        }).optional(),
        text: z.object({
            // Headline
            headlineEnabled: z.boolean().optional(),
            headlineFont: z.string().optional(),
            headlineSize: z.number().optional(),
            headlineColor: z.string().optional(),
            headlineWeight: z.string().optional(),
            headlineItalic: z.boolean().optional(),
            headlineUnderline: z.boolean().optional(),
            headlineStrikethrough: z.boolean().optional(),
            // Subheadline
            subheadlineEnabled: z.boolean().optional(),
            subheadlineFont: z.string().optional(),
            subheadlineSize: z.number().optional(),
            subheadlineColor: z.string().optional(),
            subheadlineOpacity: z.number().min(0).max(100).optional(),
            subheadlineWeight: z.string().optional(),
            subheadlineItalic: z.boolean().optional(),
            subheadlineUnderline: z.boolean().optional(),
            subheadlineStrikethrough: z.boolean().optional(),
            // Layout
            position: z.enum(['top', 'bottom']).optional(),
            offsetX: z.number().optional(),
            offsetY: z.number().optional(),
            textRotation: z.number().optional(),
            lineHeight: z.number().optional(),
            // Effects
            textShadow: z.object({
                enabled: z.boolean().optional(),
                color: z.string().optional(),
                blur: z.number().optional(),
                x: z.number().optional(),
                y: z.number().optional(),
                opacity: z.number().optional()
            }).optional(),
            textOutline: z.object({
                enabled: z.boolean().optional(),
                color: z.string().optional(),
                width: z.number().optional()
            }).optional()
        }).passthrough().optional()
    }).optional()
});

const projectJsonSpecSchema = z.object({
    appscreen: z.literal(true),
    projectName: z.string().optional(),
    exportDate: z.string().optional(),
    formatVersion: z.number().optional(),
    screenshots: z.array(z.record(z.any())).min(1),
    outputDevice: z.string().optional(),
    projectLanguages: z.array(z.string()).optional(),
    outputMode: z.enum(['mcp-output', 'app-dir']).optional(),
    outputDir: z.string().optional()
}).passthrough();

const listingSpecSchema = z.object({
    projectName: z.string().min(1),
    outputDevices: z.array(z.string().min(1)).min(1),
    languages: z.array(z.string().min(1)).min(1),
    screens: z.array(listingScreenSchema).min(1),
    defaults: z.object({
        background: z.record(z.any()).optional(),
        screenshot: z.record(z.any()).optional(),
        text: z.record(z.any()).optional()
    }).optional(),
    allowPartial: z.boolean().optional(),
    outputMode: z.enum(['mcp-output', 'app-dir']).optional(),
    outputDir: z.string().optional(),
    assetsBaseDir: z.string().optional(),
    customSize: z.object({
        width: z.number().int().min(100).max(10000),
        height: z.number().int().min(100).max(10000)
    }).optional()
});

function normalizeListingSpec(rawSpec) {
    const parsed = listingSpecSchema.parse(rawSpec);
    const languages = [...new Set(parsed.languages)];
    const outputDevices = [...new Set(parsed.outputDevices)];
    const normalized = {
        ...parsed,
        languages,
        outputDevices,
        allowPartial: parsed.allowPartial === true,
        outputMode: parsed.outputMode || 'mcp-output'
    };
    return normalized;
}

function toDataUrlFromFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
        throw new Error(`Unsupported image extension: ${ext}`);
    }
    const content = fs.readFileSync(filePath);
    return `data:${mime};base64,${content.toString('base64')}`;
}

function resolveImageSource(value, baseDir) {
    if (typeof value !== 'string' || !value) return null;
    if (value.startsWith('data:image/')) return value;
    const resolvedPath = path.isAbsolute(value) ? value : path.resolve(baseDir, value);
    if (!fs.existsSync(resolvedPath)) return null;
    return toDataUrlFromFile(resolvedPath);
}

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function summarizeDiagnostics(pageErrors, consoleErrors, requestFailures) {
    const firstPageError = pageErrors[0] || 'none';
    const firstConsoleError = consoleErrors[0] || 'none';
    const firstRequestFailure = requestFailures[0] || 'none';
    return {
        firstPageError,
        firstConsoleError,
        firstRequestFailure,
        pageErrorCount: pageErrors.length,
        consoleErrorCount: consoleErrors.length,
        requestFailureCount: requestFailures.length
    };
}

function buildSessionDiagnosticString(session) {
    const diag = summarizeDiagnostics(session.pageErrors, session.consoleErrors, session.requestFailures);
    return `firstPageError: ${diag.firstPageError}, firstConsoleError: ${diag.firstConsoleError}, firstRequestFailure: ${diag.firstRequestFailure}`;
}

function serveStaticFile(rootDir, req, res) {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const localPath = reqPath === '/' ? '/index.html' : reqPath;
    const filePath = path.resolve(rootDir, `.${localPath}`);
    if (!filePath.startsWith(path.resolve(rootDir))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.glb': 'model/gltf-binary'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
}

async function startStaticServer(rootDir) {
    const server = http.createServer((req, res) => serveStaticFile(rootDir, req, res));
    await new Promise((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.on('error', reject);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    return {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve) => server.close(() => resolve()))
    };
}

function buildPreparedSpec(spec, baseDir) {
    const warnings = [];
    const missingInputs = [];
    const skippedScreens = [];
    const preparedScreens = spec.screens.map((screen) => {
        const preparedImages = {};
        Object.entries(screen.images).forEach(([lang, source]) => {
            const dataUrl = resolveImageSource(source, baseDir);
            if (!dataUrl) {
                missingInputs.push({
                    screenId: screen.id,
                    language: lang,
                    source
                });
                return;
            }
            preparedImages[lang] = dataUrl;
        });

        spec.languages.forEach((lang) => {
            if (!preparedImages[lang] && !preparedImages.default) {
                missingInputs.push({
                    screenId: screen.id,
                    language: lang,
                    source: `missing (${lang})`
                });
            }
        });

        if (!preparedImages.default && !preparedImages[spec.languages[0]]) {
            warnings.push(`Screen "${screen.id}" does not define a default image fallback.`);
        }

        if (Object.keys(preparedImages).length === 0) {
            skippedScreens.push({
                screenId: screen.id,
                reason: 'No valid image inputs were resolved for this screen.'
            });
            return null;
        }

        return {
            id: screen.id,
            images: preparedImages,
            text: screen.text || {},
            style: screen.style || {}
        };
    });

    return {
        preparedSpec: {
            projectName: spec.projectName,
            languages: spec.languages,
            screens: preparedScreens.filter(Boolean),
            defaults: spec.defaults || {}
        },
        warnings,
        missingInputs,
        skippedScreens
    };
}

async function createAutomationSession(staticServerUrl, preparedSpec, customSize) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(MCP_DEFAULT_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(MCP_DEFAULT_TIMEOUT_MS);

    const session = {
        browser,
        page,
        pageErrors: [],
        consoleErrors: [],
        requestFailures: []
    };

    page.on('pageerror', (err) => session.pageErrors.push(String(err?.message || err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            session.consoleErrors.push(msg.text());
        }
    });
    page.on('requestfailed', (request) => {
        const failureText = request.failure()?.errorText || 'unknown';
        session.requestFailures.push(`${request.method()} ${request.url()} (${failureText})`);
    });

    const response = await page.goto(`${staticServerUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    if (!response || !response.ok()) {
        const status = response ? response.status() : 'no-response';
        throw new Error(`Failed to load app page from ${staticServerUrl}/index.html (status: ${status})`);
    }

    await page.waitForFunction(
        () => !!window.__appscreenAutomation && typeof window.__appscreenAutomation.healthCheck === 'function',
        { timeout: MCP_BOOTSTRAP_TIMEOUT_MS }
    );

    const health = await page.evaluate(async () => window.__appscreenAutomation.healthCheck());
    if (!health || health.ready !== true) {
        throw new Error('Automation health check failed.');
    }

    await page.evaluate(async (applySpec) => {
        await window.__appscreenAutomation.applyListingSpec(applySpec);
    }, {
        ...preparedSpec,
        customSize
    });

    return session;
}

async function closeAutomationSession(session) {
    if (!session) return;
    if (session.browser) {
        await session.browser.close();
    }
}

async function renderComboArtifacts(session, outputDevice, language, outputDir, artifactPaths, dimensionsByDevice) {
    const page = session.page;
    const supportsSingleRender = await page.evaluate(() => (
        !!window.__appscreenAutomation &&
        typeof window.__appscreenAutomation.renderPngAt === 'function' &&
        typeof window.__appscreenAutomation.getScreenshotCount === 'function'
    ));

    if (supportsSingleRender) {
        const screenshotCount = await page.evaluate(async () => window.__appscreenAutomation.getScreenshotCount());
        for (let index = 0; index < screenshotCount; index++) {
            const rendered = await page.evaluate(async ({ language, outputDevice, index }) => {
                return window.__appscreenAutomation.renderPngAt({ language, outputDevice, index });
            }, { language, outputDevice, index });

            if (!rendered || typeof rendered.dataUrl !== 'string') {
                throw new Error(`Invalid render result for index ${index}`);
            }

            const outputFolder = path.join(outputDir, outputDevice, language);
            ensureDir(outputFolder);
            const outputPath = path.join(outputFolder, rendered.filename || `screenshot-${index + 1}.png`);
            const base64Data = rendered.dataUrl.replace(/^data:image\/png;base64,/, '');
            fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
            artifactPaths.push(outputPath);
            dimensionsByDevice[outputDevice] = {
                width: rendered.width,
                height: rendered.height
            };
        }
        return;
    }

    const renders = await page.evaluate(async ({ language, outputDevice }) => {
        return window.__appscreenAutomation.renderAllPng({ language, outputDevice });
    }, { language, outputDevice });

    renders.forEach((rendered) => {
        const outputFolder = path.join(outputDir, outputDevice, language);
        ensureDir(outputFolder);
        const outputPath = path.join(outputFolder, rendered.filename);
        const base64Data = rendered.dataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
        artifactPaths.push(outputPath);
        dimensionsByDevice[outputDevice] = {
            width: rendered.width,
            height: rendered.height
        };
    });
}

async function runListingJob(rawSpec, { dryRun = false } = {}) {
    const spec = normalizeListingSpec(rawSpec);
    const rootDir = process.env.APPSCREEN_ROOT
        ? path.resolve(process.env.APPSCREEN_ROOT)
        : APP_ROOT;
    const assetsBaseDir = spec.assetsBaseDir
        ? path.resolve(rootDir, spec.assetsBaseDir)
        : rootDir;
    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const defaultOutputSubdir = spec.outputMode === 'app-dir'
        ? path.join('generated-listings', jobId)
        : path.join('mcp-output', jobId);
    const requestedOutputDir = spec.outputDir || defaultOutputSubdir;
    const outputDir = path.isAbsolute(requestedOutputDir)
        ? path.resolve(requestedOutputDir)
        : path.resolve(rootDir, requestedOutputDir);

    const { preparedSpec, warnings, missingInputs, skippedScreens } = buildPreparedSpec(spec, assetsBaseDir);

    const unsupportedDevices = spec.outputDevices.filter((device) => !OUTPUT_PRESETS[device] && device !== 'custom');
    if (unsupportedDevices.length > 0) {
        throw new Error(`Unsupported output devices: ${unsupportedDevices.join(', ')}`);
    }
    if (spec.outputDevices.includes('custom') && !spec.customSize) {
        throw new Error('outputDevices includes "custom" but spec.customSize is missing');
    }

    if (missingInputs.length > 0 && !spec.allowPartial) {
        throw new Error(`Missing required inputs: ${JSON.stringify(missingInputs)}`);
    }
    if (preparedSpec.screens.length === 0) {
        throw new Error('No renderable screens found after resolving inputs.');
    }

    if (dryRun) {
        return {
            jobId,
            outputDir,
            outputMode: spec.outputMode,
            outputDevices: spec.outputDevices,
            languages: spec.languages,
            expectedArtifacts: spec.outputDevices.length * spec.languages.length * preparedSpec.screens.length,
            missingInputs,
            warnings,
            skippedScreens
        };
    }

    ensureDir(outputDir);
    let staticServer;
    let session = null;
    let combosInSession = 0;
    try {
        staticServer = await startStaticServer(rootDir);
        const artifactPaths = [];
        const dimensionsByDevice = {};

        for (const outputDevice of spec.outputDevices) {
            for (const language of spec.languages) {
                const comboLabel = `${outputDevice}/${language}`;
                let comboCompleted = false;
                let lastComboError = null;

                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        if (!session || combosInSession >= MAX_COMBOS_PER_SESSION) {
                            await closeAutomationSession(session);
                            session = await createAutomationSession(staticServer.url, preparedSpec, spec.customSize);
                            combosInSession = 0;
                        }

                        await renderComboArtifacts(session, outputDevice, language, outputDir, artifactPaths, dimensionsByDevice);
                        comboCompleted = true;
                        combosInSession++;
                        break;
                    } catch (error) {
                        lastComboError = error;
                        await closeAutomationSession(session);
                        session = null;
                        combosInSession = 0;
                        if (attempt === 2) {
                            break;
                        }
                    }
                }

                if (!comboCompleted) {
                    const sessionDiag = session ? buildSessionDiagnosticString(session) : 'session unavailable';
                    throw new Error(
                        `Failed rendering combo ${comboLabel} after retry: ${lastComboError?.message || 'unknown error'} (${sessionDiag})`
                    );
                }
            }
        }

        return {
            jobId,
            outputDir,
            outputMode: spec.outputMode,
            artifactPaths,
            dimensionsByDevice,
            missingInputs,
            warnings,
            skippedScreens
        };
    } finally {
        await closeAutomationSession(session);
        if (staticServer) await staticServer.close();
    }
}

async function diagnoseAppBoot() {
    const rootDir = process.env.APPSCREEN_ROOT
        ? path.resolve(process.env.APPSCREEN_ROOT)
        : APP_ROOT;

    let browser;
    let staticServer;
    try {
        staticServer = await startStaticServer(rootDir);
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
        const pageErrors = [];
        const consoleErrors = [];
        const requestFailures = [];
        page.on('pageerror', (err) => pageErrors.push(String(err?.message || err)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        page.on('requestfailed', (request) => {
            const failureText = request.failure()?.errorText || 'unknown';
            requestFailures.push(`${request.method()} ${request.url()} (${failureText})`);
        });

        const response = await page.goto(`${staticServer.url}/index.html`, { waitUntil: 'domcontentloaded' });
        const status = response ? response.status() : null;
        const ok = response ? response.ok() : false;
        const title = await page.title().catch(() => 'unknown');

        let automationReady = false;
        let health = null;
        let waitError = null;
        try {
            await page.waitForFunction(
                () => !!window.__appscreenAutomation && typeof window.__appscreenAutomation.healthCheck === 'function',
                { timeout: MCP_BOOTSTRAP_TIMEOUT_MS }
            );
            automationReady = true;
            health = await page.evaluate(async () => window.__appscreenAutomation.healthCheck());
        } catch (error) {
            waitError = error.message;
        }

        const diag = summarizeDiagnostics(pageErrors, consoleErrors, requestFailures);
        return {
            rootDir,
            servedUrl: `${staticServer.url}/index.html`,
            httpStatus: status,
            httpOk: ok,
            title,
            automationReady,
            health,
            waitError,
            diagnostics: diag,
            samplePageErrors: pageErrors.slice(0, 5),
            sampleConsoleErrors: consoleErrors.slice(0, 5),
            sampleRequestFailures: requestFailures.slice(0, 5)
        };
    } finally {
        if (browser) await browser.close();
        if (staticServer) await staticServer.close();
    }
}

async function runProjectJob(projectData, options = {}) {
    const parsedData = projectJsonSpecSchema.parse(projectData);

    const rootDir = process.env.APPSCREEN_ROOT
        ? path.resolve(process.env.APPSCREEN_ROOT)
        : APP_ROOT;
    const jobId = `job_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const outputMode = options.outputMode || parsedData.outputMode || 'mcp-output';
    const defaultOutputSubdir = outputMode === 'app-dir'
        ? path.join('generated-listings', jobId)
        : path.join('mcp-output', jobId);
    const requestedOutputDir = options.outputDir || parsedData.outputDir || defaultOutputSubdir;
    const outputDir = path.isAbsolute(requestedOutputDir)
        ? path.resolve(requestedOutputDir)
        : path.resolve(rootDir, requestedOutputDir);

    const outputDevices = options.overrideDevices && options.overrideDevices.length > 0
        ? options.overrideDevices
        : [parsedData.outputDevice || 'iphone-6.9'];

    const languages = options.overrideLanguages && options.overrideLanguages.length > 0
        ? options.overrideLanguages
        : parsedData.projectLanguages || ['en'];

    const unsupportedDevices = outputDevices.filter((device) => !OUTPUT_PRESETS[device] && device !== 'custom');
    if (unsupportedDevices.length > 0) {
        throw new Error(`Unsupported output devices: ${unsupportedDevices.join(', ')}`);
    }

    ensureDir(outputDir);
    let staticServer;
    let session = null;
    let combosInSession = 0;
    const artifactPaths = [];
    const dimensionsByDevice = {};

    try {
        staticServer = await startStaticServer(rootDir);

        for (const outputDevice of outputDevices) {
            for (const language of languages) {
                const comboLabel = `${outputDevice}/${language}`;
                let comboCompleted = false;
                let lastComboError = null;

                for (let attempt = 1; attempt <= 2; attempt++) {
                    try {
                        if (!session || combosInSession >= MAX_COMBOS_PER_SESSION) {
                            if (session) await closeAutomationSession(session);
                            session = await createAutomationSession(staticServer.url, { screens: [], languages: [] }, parsedData.customSize);

                            await session.page.evaluate(async (json) => {
                                await window.__appscreenAutomation.applyProjectJson(json);
                            }, parsedData);

                            combosInSession = 0;
                        }

                        await renderComboArtifacts(session, outputDevice, language, outputDir, artifactPaths, dimensionsByDevice);
                        comboCompleted = true;
                        combosInSession++;
                        break;
                    } catch (error) {
                        lastComboError = error;
                        if (session) await closeAutomationSession(session);
                        session = null;
                        combosInSession = 0;
                    }
                }

                if (!comboCompleted) {
                    throw new Error(`Failed rendering project combo ${comboLabel} after retry: ${lastComboError?.message || 'unknown error'}`);
                }
            }
        }

        return {
            jobId,
            outputDir,
            outputMode,
            artifactPaths,
            dimensionsByDevice
        };
    } finally {
        if (session) await closeAutomationSession(session);
        if (staticServer) await staticServer.close();
    }
}

function jsonTextResult(payload) {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(payload, null, 2)
            }
        ]
    };
}

function getCapabilitiesPayload() {
    return {
        server: {
            name: 'appscreen-listing-mcp',
            version: '1.1.0'
        },
        scope: {
            deterministicOnly: true,
            includesAiGeneration: false
        },
        output: {
            presetDevices: OUTPUT_PRESETS,
            customDeviceSupported: true,
            outputModes: ['mcp-output', 'app-dir'],
            outputPathTemplate: '<outputDir>/<device>/<language>/screenshot-<index>.png'
        },
        listingSpecContract: {
            required: ['projectName', 'outputDevices[]', 'languages[]', 'screens[]'],
            screenFields: ['id', 'images', 'text? (headline/subheadline maps)', 'style? (background/screenshot/text)'],
            optional: ['defaults', 'allowPartial', 'outputMode', 'outputDir', 'assetsBaseDir', 'customSize'],
            supportedStyles: {
                background: {
                    type: 'solid | gradient | image',
                    solid: 'hex color string for solid backgrounds',
                    gradient: {
                        angle: 'number 0–360 (degrees)',
                        stops: 'array of {color: hex, position: 0–100} — supports 2+ stops for multi-color gradients'
                    },
                    image: {
                        imageSrc: 'file path or data URL',
                        imageFit: 'cover | contain | stretch',
                        imageBlur: 'number (px, 0 = no blur)',
                        overlayColor: 'hex color string',
                        overlayOpacity: 'number 0–100'
                    },
                    noise: 'boolean — add film grain texture over background',
                    noiseIntensity: 'number 0–100'
                },
                screenshot: {
                    scale: 'number (% of canvas, e.g. 70)',
                    x: 'number (% horizontal position, 50 = centered)',
                    y: 'number (% vertical position, 50 = centered; values outside 0–100 bleed off canvas)',
                    rotation: 'number (degrees, -180 to 180)',
                    perspective: 'number (0 = flat, higher = stronger 3D tilt effect)',
                    cornerRadius: 'number (px for rounded corners on 2D mockup)',
                    positionPresets: {
                        note: 'Shortcut values for common layouts — just set scale/x/y/rotation/perspective to match',
                        centered:       { scale: 70, x: 50, y: 50,  rotation: 0,  perspective: 0  },
                        'float-center': { scale: 60, x: 50, y: 50,  rotation: 0,  perspective: 0  },
                        'float-bottom': { scale: 55, x: 50, y: 70,  rotation: 0,  perspective: 0  },
                        'bleed-bottom': { scale: 85, x: 50, y: 120, rotation: 0,  perspective: 0  },
                        'bleed-top':    { scale: 85, x: 50, y: -20, rotation: 0,  perspective: 0  },
                        'tilt-left':    { scale: 65, x: 50, y: 60,  rotation: -8, perspective: 0  },
                        'tilt-right':   { scale: 65, x: 50, y: 60,  rotation: 8,  perspective: 0  },
                        perspective:    { scale: 65, x: 50, y: 50,  rotation: 0,  perspective: 15 }
                    },
                    shadow: {
                        enabled: 'boolean',
                        color: 'hex',
                        blur: 'number (px)',
                        opacity: 'number 0–100',
                        x: 'number (px offset)',
                        y: 'number (px offset)'
                    },
                    frame: {
                        enabled: 'boolean — draw a device border around the screenshot',
                        color: 'hex',
                        width: 'number (px)',
                        opacity: 'number 0–100'
                    },
                    deviceFrame: {
                        enabled: 'boolean — draw a 2D canvas-drawn device bezel around the screenshot',
                        type: 'iphone | android | ipad — which device shape and hardware details to render',
                        colorScheme: 'dark | light | custom — color theme for the bezel body',
                        customColor: 'hex string — bezel color when colorScheme is "custom"',
                        note: 'When enabled, shadow applies to the body rect (larger than screen). Coexists with frame (border). Hidden in 3D mode.'
                    },
                    use3D: 'boolean — render screenshot inside a 3D phone model instead of flat',
                    device3D: 'iphone | android',
                    rotation3D: '{x: number, y: number, z: number} — euler angles for 3D model rotation'
                },
                text: {
                    headline: {
                        headlineEnabled: 'boolean',
                        headlineFont: 'font family string (e.g. "Inter", "SF Pro Display")',
                        headlineSize: 'number (px)',
                        headlineColor: 'hex color string',
                        headlineWeight: 'string (e.g. "400", "600", "700", "bold")',
                        headlineItalic: 'boolean',
                        headlineUnderline: 'boolean',
                        headlineStrikethrough: 'boolean'
                    },
                    subheadline: {
                        subheadlineEnabled: 'boolean — subheadline is off by default',
                        subheadlineFont: 'font family string — defaults to headlineFont if omitted',
                        subheadlineSize: 'number (px)',
                        subheadlineColor: 'hex color string',
                        subheadlineOpacity: 'number 0–100',
                        subheadlineWeight: 'string (e.g. "400", "600")',
                        subheadlineItalic: 'boolean',
                        subheadlineUnderline: 'boolean',
                        subheadlineStrikethrough: 'boolean'
                    },
                    layout: {
                        position: 'top | bottom — vertical anchor for both texts',
                        offsetX: 'number 0–100 (% horizontal offset, 50 = centered)',
                        offsetY: 'number 0–100 (% distance from top/bottom edge)',
                        textRotation: 'number (degrees, rotates entire text block around its anchor)',
                        lineHeight: 'number (%, 100 = normal, 110 = 10% extra spacing)'
                    },
                    effects: {
                        textShadow: {
                            enabled: 'boolean',
                            color: 'hex',
                            blur: 'number (px)',
                            x: 'number (px offset)',
                            y: 'number (px offset)',
                            opacity: 'number 0–100'
                        },
                        textOutline: {
                            enabled: 'boolean',
                            color: 'hex',
                            width: 'number (px stroke width)'
                        },
                        decorations: 'headlineUnderline / headlineStrikethrough / subheadlineUnderline / subheadlineStrikethrough — rendered as filled rectangles in the text color at the correct baseline/midline positions'
                    },
                    notes: [
                        'textShadow and textOutline apply to both headline and subheadline simultaneously',
                        'textRotation rotates the entire text block (headline + subheadline together) around its anchor point',
                        'headline text per language is set via screen.text.headline map, not style.text',
                        'subheadline text per language is set via screen.text.subheadline map, not style.text',
                        'providing screen.text.headline automatically enables the headline (headlineEnabled=true)',
                        'providing screen.text.subheadline automatically enables the subheadline (subheadlineEnabled=true)',
                        'lineHeight (%) controls headline line spacing only — subheadline line spacing is hardcoded to 1.4x subheadlineSize',
                        'rendering order: background → screenshot → text → noise overlay'
                    ]
                }
            }
        },
        automationSurface: {
            namespace: 'window.__appscreenAutomation',
            methods: [
                'getVersion',
                'healthCheck',
                'getScreenshotCount',
                'resetProject',
                'importLocalizedScreenshots',
                'applyListingSpec',
                'applyProjectJson',
                'renderAllPng',
                'renderPngAt'
            ]
        },
        reliability: {
            timeoutMs: MCP_DEFAULT_TIMEOUT_MS,
            bootstrapWaitMs: MCP_BOOTSTRAP_TIMEOUT_MS,
            comboRetries: 1,
            sessionRecycleAfterCombos: MAX_COMBOS_PER_SESSION,
            sessionRecycleIsHardLimit: false
        },
        tools: [
            'get_capabilities',
            'list_output_presets',
            'validate_listing_spec',
            'dry_run_listing_job',
            'generate_listing_images',
            'render_project_json',
            'diagnose_app_boot'
        ],
        exampleSpec: EXAMPLE_LISTING_SPEC
    };
}

function getTools() {
    return [
        {
            name: 'get_capabilities',
            description: 'Return a structured capability manifest for this MCP server, including spec contract and examples.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        },
        {
            name: 'list_output_presets',
            description: 'List supported output devices and dimensions for listing image generation.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        },
        {
            name: 'validate_listing_spec',
            description: 'Validate and normalize a listing generation spec without rendering images.',
            inputSchema: {
                type: 'object',
                properties: {
                    spec: { type: 'object' }
                },
                required: ['spec'],
                additionalProperties: false
            }
        },
        {
            name: 'dry_run_listing_job',
            description: 'Resolve assets and estimate artifacts without generating files.',
            inputSchema: {
                type: 'object',
                properties: {
                    spec: { type: 'object' }
                },
                required: ['spec'],
                additionalProperties: false
            }
        },
        {
            name: 'generate_listing_images',
            description: 'Render listing screenshots for all requested output devices and languages. Each screen supports full style control via style.background (solid/gradient with custom stops/image+blur+overlay), style.screenshot (scale, x/y position, rotation, perspective, cornerRadius, shadow, frame border, 2D or 3D device mockup), and style.text (headline and subheadline each with independent font/size/weight/color/opacity/italic, plus shared layout: position top/bottom, offsetX/Y, textRotation, lineHeight, textShadow, textOutline). Defaults can be set at job level via spec.defaults. Call get_capabilities for the full field reference.',
            inputSchema: {
                type: 'object',
                properties: {
                    spec: { type: 'object' }
                },
                required: ['spec'],
                additionalProperties: false
            }
        },
        {
            name: 'diagnose_app_boot',
            description: 'Diagnose whether the local app boots correctly for MCP automation.',
            inputSchema: {
                type: 'object',
                properties: {},
                additionalProperties: false
            }
        },
        {
            name: 'render_project_json',
            description: 'Render listing screenshots directly from an exported .appscreen.json project state. Overrides languages or devices if provided.',
            inputSchema: {
                type: 'object',
                properties: {
                    projectData: { type: 'object' },
                    outputMode: { type: 'string', enum: ['mcp-output', 'app-dir'] },
                    outputDir: { type: 'string' },
                    overrideDevices: { type: 'array', items: { type: 'string' } },
                    overrideLanguages: { type: 'array', items: { type: 'string' } }
                },
                required: ['projectData'],
                additionalProperties: false
            }
        }
    ];
}

async function handleToolCall(name, args) {
    switch (name) {
        case 'get_capabilities':
            return jsonTextResult(getCapabilitiesPayload());
        case 'list_output_presets':
            return jsonTextResult({
                outputPresets: OUTPUT_PRESETS,
                supportsCustom: true
            });
        case 'validate_listing_spec': {
            const spec = normalizeListingSpec(args.spec);
            const rootDir = process.env.APPSCREEN_ROOT
                ? path.resolve(process.env.APPSCREEN_ROOT)
                : APP_ROOT;
            const assetsBaseDir = spec.assetsBaseDir ? path.resolve(rootDir, spec.assetsBaseDir) : rootDir;
            const { warnings, missingInputs } = buildPreparedSpec(spec, assetsBaseDir);
            return jsonTextResult({
                valid: true,
                normalizedSpec: spec,
                warnings,
                missingInputs
            });
        }
        case 'dry_run_listing_job': {
            const result = await runListingJob(args.spec, { dryRun: true });
            return jsonTextResult(result);
        }
        case 'generate_listing_images': {
            const result = await runListingJob(args.spec, { dryRun: false });
            return jsonTextResult(result);
        }
        case 'diagnose_app_boot': {
            const result = await diagnoseAppBoot();
            return jsonTextResult(result);
        }
        case 'render_project_json': {
            const result = await runProjectJob(args.projectData, {
                outputMode: args.outputMode,
                outputDir: args.outputDir,
                overrideDevices: args.overrideDevices,
                overrideLanguages: args.overrideLanguages
            });
            return jsonTextResult(result);
        }
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

async function startMcpServer() {
    const server = new Server(
        {
            name: 'appscreen-listing-mcp',
            version: '1.1.0'
        },
        {
            capabilities: {
                tools: {}
            }
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: getTools()
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name;
        const args = request.params.arguments || {};
        try {
            return await handleToolCall(toolName, args);
        } catch (error) {
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: error.message
                        }, null, 2)
                    }
                ]
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

if (require.main === module) {
    startMcpServer().catch((error) => {
        logDebug(`START ERROR: ${error.stack || error}`);
        process.exit(1);
    });
}

module.exports = {
    OUTPUT_PRESETS,
    normalizeListingSpec,
    buildPreparedSpec,
    runListingJob
};
