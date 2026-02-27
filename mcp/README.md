# MCP Automation (Local Server)

This repository includes a local MCP server for deterministic listing image generation.

## Start

```bash
npm install
npm run mcp:start
```

The server runs over `stdio` (no HTTP API exposed).

By default, the server resolves the app root from the location of `mcp/server.js`.
If your agent runs from an unusual environment, you can force the root with:

```bash
APPSCREEN_ROOT=/absolute/path/to/appscreen-AI node mcp/server.js
```

## Tools

- `get_capabilities`
- `list_output_presets`
- `validate_listing_spec`
- `dry_run_listing_job`
- `generate_listing_images`
- `diagnose_app_boot`

## Listing Spec (minimal)

```json
{
  "projectName": "My Listing",
  "outputDevices": ["iphone-6.9", "android-phone"],
  "languages": ["en", "de"],
  "screens": [
    {
      "id": "screen-1",
      "images": {
        "en": "fixtures/screen1-en.png",
        "de": "fixtures/screen1-de.png",
        "default": "fixtures/screen1-en.png"
      },
      "text": {
        "headline": { "en": "Track Everything", "de": "Alles im Blick" },
        "subheadline": { "en": "Fast and simple", "de": "Schnell und einfach" }
      }
    }
  ],
  "outputDir": "mcp-output/my-run"
}
```

For `outputDevices: ["custom"]`, include:

```json
"customSize": { "width": 1290, "height": 2796 }
```

Output location control:

- Default mode: `"outputMode": "mcp-output"` (writes under `mcp-output/...`)
- App directory mode: `"outputMode": "app-dir"` (writes under `generated-listings/...` in the app repo by default)
- Override target directory explicitly with `"outputDir"` (relative to app root, or absolute path)

Example writing directly into app assets:

```json
{
  "outputMode": "app-dir",
  "outputDir": "img/generated-listings"
}
```

## Client Configuration Example

Example local client config snippet:

```json
{
  "mcpServers": {
    "appscreen": {
      "command": "node",
      "args": ["/absolute/path/to/appscreen-AI/mcp/server.js"]
    }
  }
}
```

Ready-made config files in this repo:

- `mcp/mcp-agent-config.template.json` (portable template)
- `mcp/mcp-agent-config.windows.json` (pre-filled for `D:/AndroidStudioProjects/appscreen-AI`)
- `mcp/mcp-agent-config.codex.toml` (for Codex `~/.codex/config.toml`)
- `mcp/mcp-agent-config.claude-desktop.json` (for Claude Desktop config)
- `mcp/mcp-agent-config.antigravity.json` (for Antigravity raw MCP config)

Common config locations:

- Codex: `~/.codex/config.toml` (merge the `[mcp_servers.appscreen]` block)
- Claude Desktop (Windows): `%APPDATA%/Claude/claude_desktop_config.json`
- Antigravity: open **Manage MCP Servers** and use **View raw config** (`mcp_config.json`)

## Notes

- MCP v1 is deterministic (no AI calls).
- Missing required assets fail the job unless `allowPartial` is `true`.
- If generation fails, run `diagnose_app_boot` first to capture page errors, console errors, and failed network requests.
- Ask agents to call `get_capabilities` first so they can build valid specs from the live capability manifest.
- `sessionRecycleAfterCombos` is a recycle threshold, not a total job limit. Jobs continue across multiple browser sessions.
