const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { runListingJob, normalizeListingSpec } = require('../../mcp/server');

async function main() {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appscreen-mcp-'));
    try {
        const fixturesDir = path.resolve(__dirname, '../fixtures');
        const spec = {
            projectName: 'MCP Integration',
            outputDevices: ['iphone-6.9'],
            languages: ['en'],
            screens: [
                {
                    id: 'screen-1',
                    images: {
                        en: path.join(fixturesDir, 'red.png'),
                        default: path.join(fixturesDir, 'red.png')
                    },
                    text: {
                        headline: { en: 'Track It' },
                        subheadline: { en: 'Keep things simple' }
                    }
                }
            ],
            outputDir: tmpRoot
        };

        const normalized = normalizeListingSpec(spec);
        assert.strictEqual(normalized.outputDevices.length, 1);
        assert.strictEqual(normalized.languages.length, 1);

        const dryRun = await runListingJob(spec, { dryRun: true });
        assert.strictEqual(dryRun.expectedArtifacts, 1);
        assert.strictEqual(dryRun.missingInputs.length, 0);

        const rendered = await runListingJob(spec, { dryRun: false });
        assert.strictEqual(rendered.artifactPaths.length, 1);
        assert.ok(fs.existsSync(rendered.artifactPaths[0]));
        assert.strictEqual(rendered.dimensionsByDevice['iphone-6.9'].width, 1320);
        assert.strictEqual(rendered.dimensionsByDevice['iphone-6.9'].height, 2868);

        console.log('MCP integration test passed');
    } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
