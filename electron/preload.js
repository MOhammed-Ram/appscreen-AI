const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Check if running in Electron
    isElectron: true,

    // Platform info
    platform: process.platform,

    // Show native save dialog
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

    // Show native open dialog
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    // Receive settings updates from main process
    onApplySettings: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('apply-settings', (_event, settings) => callback(settings));
    },

    onImportFiles: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('import-files', (_event, filesData) => callback(filesData));
    },

    // MCP Server management
    mcpStart: () => ipcRenderer.invoke('mcp-start'),
    mcpStop: () => ipcRenderer.invoke('mcp-stop'),
    mcpStatus: () => ipcRenderer.invoke('mcp-status'),
    onMcpLog: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('mcp-log', (_event, data) => callback(data));
    },
    onMcpStatusChange: (callback) => {
        if (typeof callback !== 'function') return;
        ipcRenderer.on('mcp-status-change', (_event, status) => callback(status));
    }
});
