#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

const port = Number(process.argv[2] || 4173);
const rootDir = path.resolve(__dirname, '../..');

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary'
};

function safeResolve(requestPath) {
    const normalizedPath = decodeURIComponent((requestPath || '/').split('?')[0]);
    const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
    const resolved = path.resolve(rootDir, `.${relativePath}`);
    if (!resolved.startsWith(rootDir)) return null;
    return resolved;
}

const server = http.createServer((req, res) => {
    const filePath = safeResolve(req.url);
    if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`Static test server running on http://127.0.0.1:${port}\n`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
