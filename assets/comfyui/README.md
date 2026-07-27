# ComfyUI workflows — Pomnia

MCP server [`comfyui-cursor-mcp`](https://github.com/lobrzut/comfyui-cursor-mcp) builds FLUX/SDXL graphs in Python — **JSON files here are optional overrides and prompt references**.

| File | Asset | MCP call |
|------|-------|----------|
| `logo-concept.json` | Slavic green logo concepts | `style=icon size=512x512 workflow=flux lora=flat-ui background=dark_navy project_style=false` — see [`docs/BRAND-LOGO.md`](../../docs/BRAND-LOGO.md) |
| `pomnia-flux-icon.json` | App icon 512×512 (legacy violet) | `style=icon size=512x512 workflow=flux lora=flat-ui` |
| *(planned)* `pomnia-hero-flux.json` | Landing hero | `style=banner size=1920x1080 workflow=flux lora=none` |
| *(planned)* `pomnia-og-flux.json` | OG image pomnia.ai | `size=1200x630 workflow=flux` |

## Export custom workflow from ComfyUI (ISKRA)

1. Open ComfyUI: `http://comfy.example.local:7821`
2. Build graph (FLUX txt2img + optional LoRA `cursor-approved/flat-ui`)
3. **Save (API Format)** → save as `assets/comfyui/your-name.json`
4. Set `COMFYUI_WORKFLOWS_DIR` in MCP env if you want MCP to load from this folder

See [`docs/COMFYUI-ASSETS.md`](../../docs/COMFYUI-ASSETS.md) for the full asset pipeline.
