const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { normalizeSettings, loadSettings, saveSettings } = require('./settings-store');

// Keep a global reference of the window object
let mainWindow;
let aboutWindow;
let preferencesWindow;
let settingsFilePath;
let mcpProcess = null;

// Check if running in development mode
const isDev = process.argv.includes('--dev');

function getSettingsFilePath() {
    if (!settingsFilePath) {
        settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
    }
    return settingsFilePath;
}

async function readSettingsFromRenderer() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return {};
    }
    try {
        return await mainWindow.webContents.executeJavaScript(`
            (function () {
                return {
                    provider: localStorage.getItem('aiProvider') || 'anthropic',
                    anthropicKey: localStorage.getItem('anthropicApiKey') || '',
                    openaiKey: localStorage.getItem('openaiApiKey') || '',
                    googleKey: localStorage.getItem('googleApiKey') || '',
                    anthropicModel: localStorage.getItem('anthropicModel') || '',
                    openaiModel: localStorage.getItem('openaiModel') || '',
                    googleModel: localStorage.getItem('googleModel') || ''
                };
            })();
        `);
    } catch {
        return {};
    }
}

function pushSettingsToRenderer(settings) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('apply-settings', normalizeSettings(settings));
}

function showAboutWindow() {
    // If already open, focus it
    if (aboutWindow) {
        aboutWindow.focus();
        return;
    }

    aboutWindow = new BrowserWindow({
        width: 400,
        height: 380,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: 'About yuzu.shot',
        backgroundColor: '#1a1a2e',
        show: false,
        parent: mainWindow,
        modal: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load inline HTML for the about window
    const aboutHTML = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #1a1a2e;
                color: #e0e0e0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                padding: 30px;
                text-align: center;
                -webkit-user-select: none;
                user-select: none;
            }
            .icon {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, rgba(102, 126, 234, 0.3) 0%, rgba(118, 75, 162, 0.3) 100%);
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px;
            }
            .icon svg {
                width: 48px;
                height: 48px;
                fill: #667eea;
            }
            h1 {
                font-size: 22px;
                font-weight: 600;
                margin-bottom: 6px;
                color: #fff;
            }
            .version {
                font-size: 13px;
                color: #888;
                margin-bottom: 16px;
            }
            .description {
                font-size: 13px;
                color: #aaa;
                line-height: 1.5;
                margin-bottom: 12px;
            }
            .author {
                font-size: 12px;
                color: #888;
            }
            .license {
                font-size: 11px;
                color: #666;
                margin-top: 12px;
            }
            .links {
                margin-top: 8px;
            }
            a {
                color: #667eea;
                text-decoration: none;
            }
            a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="icon">
            <svg viewBox="0 0 100 100">
                <rect width="100" height="100" rx="20" fill="#667eea"/>
                <rect x="20" y="30" width="60" height="45" rx="5" fill="white"/>
                <circle cx="50" cy="20" r="5" fill="white"/>
            </svg>
        </div>
        <h1>yuzu.shot</h1>
        <div class="version">Version 1.0.0</div>
        <div class="description">
            A free tool for creating beautiful App Store screenshots with customizable backgrounds, text overlays, and device frames.
        </div>
        <div class="author">
            Created by <a href="https://yuzuhub.com/en" target="_blank">Stefan from yuzuhub.com</a>
        </div>
        <div class="license">
            This project is free and open source under the <a href="https://github.com/YUZU-Hub/appscreen/blob/main/LICENSE" target="_blank">MIT License</a>.
        </div>
        <div class="links">
            <a href="https://github.com/YUZU-Hub/appscreen" target="_blank">GitHub</a>
        </div>
    </body>
    </html>
    `;

    aboutWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(aboutHTML));

    aboutWindow.once('ready-to-show', () => {
        aboutWindow.show();
    });

    // Handle external links
    aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    aboutWindow.on('closed', () => {
        aboutWindow = null;
    });
}

function showPreferencesWindow() {
    // If already open, focus it
    if (preferencesWindow) {
        preferencesWindow.focus();
        return;
    }

    preferencesWindow = new BrowserWindow({
        width: 500,
        height: 620,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: 'Preferences',
        backgroundColor: '#1a1a2e',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-preferences.js')
        }
    });

    preferencesWindow.loadFile(path.join(__dirname, 'preferences.html'));

    preferencesWindow.once('ready-to-show', () => {
        preferencesWindow.show();
    });

    // Handle external links
    preferencesWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    preferencesWindow.on('closed', () => {
        preferencesWindow = null;
    });
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'yuzu.shot',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#1a1a2e',
        show: false, // Don't show until ready
        titleBarStyle: 'hiddenInset', // macOS: hide title bar but keep traffic lights
        trafficLightPosition: { x: 15, y: 15 }
    });

    // Load the index.html of the app
    mainWindow.loadFile('index.html');
    mainWindow.webContents.on('did-finish-load', () => {
        const persisted = loadSettings(getSettingsFilePath());
        pushSettingsToRenderer(persisted);
    });

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools in development mode
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Emitted when the window is closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Create application menu
    createMenu();
}

function createMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        // App menu (macOS only)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                {
                    label: 'About yuzu.shot',
                    click: () => showAboutWindow()
                },
                { type: 'separator' },
                {
                    label: 'Preferences...',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => showPreferencesWindow()
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        // File menu
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Project',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow.webContents.executeJavaScript('createProjectFromElectron()');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Import Screenshots...',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openFile', 'multiSelections'],
                            filters: [
                                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
                            ]
                        });
                        if (!result.canceled && result.filePaths.length > 0) {
                            // Read files and convert to data URLs, then pass to handleFiles
                            const fileDataPromises = result.filePaths.map(async (filePath) => {
                                const data = fs.readFileSync(filePath);
                                const ext = path.extname(filePath).toLowerCase();
                                const mimeTypes = {
                                    '.png': 'image/png',
                                    '.jpg': 'image/jpeg',
                                    '.jpeg': 'image/jpeg',
                                    '.gif': 'image/gif',
                                    '.webp': 'image/webp'
                                };
                                const mimeType = mimeTypes[ext] || 'image/png';
                                const base64 = data.toString('base64');
                                const dataUrl = `data:${mimeType};base64,${base64}`;
                                const name = path.basename(filePath);
                                return { dataUrl, name };
                            });
                            const filesData = await Promise.all(fileDataPromises);
                            mainWindow.webContents.send('import-files', filesData);
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export Current',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => {
                        mainWindow.webContents.executeJavaScript('exportCurrent()');
                    }
                },
                {
                    label: 'Export All',
                    accelerator: 'CmdOrCtrl+Shift+E',
                    click: () => {
                        mainWindow.webContents.executeJavaScript('exportAll()');
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        // Edit menu
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ]
        },
        // View menu
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close' }
                ])
            ]
        },
        // Help menu
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Documentation',
                    click: () => {
                        shell.openExternal('https://github.com/YUZU-Hub/appscreen');
                    }
                },
                {
                    label: 'Report Issue',
                    click: () => {
                        shell.openExternal('https://github.com/YUZU-Hub/appscreen/issues');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Visit yuzuhub.com',
                    click: () => {
                        shell.openExternal('https://yuzuhub.com/en');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    getSettingsFilePath();
    createWindow();

    // On macOS, re-create window when dock icon is clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Clean up MCP server on quit
app.on('before-quit', () => {
    if (mcpProcess) {
        mcpProcess.kill();
        mcpProcess = null;
    }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle file save dialog from renderer
ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
});

// Handle file open dialog from renderer
ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
});

// Handle settings communication between preferences window and main app
ipcMain.handle('get-settings', async () => {
    const persisted = loadSettings(getSettingsFilePath());
    const hasPersistedSecrets = ['anthropicKey', 'openaiKey', 'googleKey']
        .some((key) => typeof persisted[key] === 'string' && persisted[key].length > 0);
    if (hasPersistedSecrets) {
        return persisted;
    }
    const rendererSettings = await readSettingsFromRenderer();
    const normalized = normalizeSettings(rendererSettings, persisted);
    saveSettings(getSettingsFilePath(), normalized);
    return normalized;
});

ipcMain.handle('save-settings', async (event, settings) => {
    try {
        const normalized = saveSettings(getSettingsFilePath(), settings);
        pushSettingsToRenderer(normalized);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// Get LLM providers config from main window's llm.js
ipcMain.handle('get-llm-providers', async () => {
    try {
        const providers = await mainWindow.webContents.executeJavaScript('JSON.stringify(llmProviders)');
        return JSON.parse(providers);
    } catch (e) {
        // Fallback if llmProviders is not available
        return null;
    }
});

// MCP Server management
const mcpServerPath = path.resolve(__dirname, '..', 'mcp', 'server.js');
const appRoot = path.resolve(__dirname, '..');

ipcMain.handle('mcp-start', async () => {
    if (mcpProcess) {
        return { success: false, error: 'MCP server is already running' };
    }
    try {
        mcpProcess = spawn(process.execPath, [mcpServerPath], {
            env: { ...process.env, APPSCREEN_ROOT: appRoot },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        mcpProcess.stderr.on('data', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mcp-log', data.toString());
            }
        });

        mcpProcess.stdout.on('data', (data) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mcp-log', '[stdout] ' + data.toString());
            }
        });

        mcpProcess.on('error', (err) => {
            mcpProcess = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mcp-log', '[error] ' + err.message);
                mainWindow.webContents.send('mcp-status-change', { running: false });
            }
        });

        mcpProcess.on('exit', (code) => {
            const pid = mcpProcess?.pid;
            mcpProcess = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mcp-log', `[exit] Process exited with code ${code}`);
                mainWindow.webContents.send('mcp-status-change', { running: false, pid, code });
            }
        });

        return { success: true, pid: mcpProcess.pid };
    } catch (e) {
        mcpProcess = null;
        return { success: false, error: e.message };
    }
});

ipcMain.handle('mcp-stop', async () => {
    if (!mcpProcess) {
        return { success: false, error: 'MCP server is not running' };
    }
    try {
        mcpProcess.kill();
        mcpProcess = null;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('mcp-status', async () => {
    return {
        running: mcpProcess !== null,
        pid: mcpProcess?.pid || null,
        serverPath: mcpServerPath
    };
});
