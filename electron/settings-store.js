const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
    provider: 'anthropic',
    anthropicKey: '',
    openaiKey: '',
    googleKey: '',
    anthropicModel: '',
    openaiModel: '',
    googleModel: ''
};

function sanitizeString(value, maxLength = 10000) {
    if (typeof value !== 'string') return '';
    return value.slice(0, maxLength);
}

function sanitizeProvider(provider) {
    const allowed = new Set(['anthropic', 'openai', 'google']);
    return allowed.has(provider) ? provider : DEFAULT_SETTINGS.provider;
}

function normalizeSettings(input = {}, fallback = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...fallback, ...(input || {}) };
    return {
        provider: sanitizeProvider(merged.provider),
        anthropicKey: sanitizeString(merged.anthropicKey),
        openaiKey: sanitizeString(merged.openaiKey),
        googleKey: sanitizeString(merged.googleKey),
        anthropicModel: sanitizeString(merged.anthropicModel, 200),
        openaiModel: sanitizeString(merged.openaiModel, 200),
        googleModel: sanitizeString(merged.googleModel, 200)
    };
}

function loadSettings(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return { ...DEFAULT_SETTINGS };
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return normalizeSettings(parsed);
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(filePath, inputSettings = {}) {
    const normalized = normalizeSettings(inputSettings, loadSettings(filePath));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
}

module.exports = {
    DEFAULT_SETTINGS,
    normalizeSettings,
    loadSettings,
    saveSettings
};
