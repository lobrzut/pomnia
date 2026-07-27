#!/usr/bin/env python3
"""Generate Pomnia logo refine variants (shortlist: Dew Sigil + Moss Vault) via ISKRA."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MCP = Path(__file__).resolve().parents[2] / "comfyui-cursor-mcp"
sys.path.insert(0, str(MCP))

from comfyui_cursor_mcp import comfy_client as cc  # noqa: E402

STYLE = (
    "Pomnia Slavic memory vault brand: forest emerald #1a5c3a, moss #3d6b4f, "
    "birch silver-green #a8c4b0, amber accent #c9a227, dew #7ec8a4, void #0a120e. "
    "Flat vector icon, original Slavic geometry, no cliche eagles wolves, "
    "no purple cyan magenta teal, no text, no photorealism, no 3d render."
)

NEGATIVE_EXTRA = "landscape, scene, trees, forest background, illustration, photorealistic"

REFINES = [
    (
        "logo-refine-dew-sigil-v2",
        42101,
        "App icon logo mark, Dew Sigil refine: single centered geometric sigil symbol only, "
        "original angular lattice not Elder Futhark, three morning dew droplets, vesica memory "
        "gate at center, emerald and moss green palette, dew highlights #7ec8a4, flat vector UI "
        "icon, square format, solid dark void background #0a120e, crisp edges, generous padding, "
        "readable at 32px, no text no letters no landscape no scene no trees",
    ),
    (
        "logo-refine-dew-sigil-v3",
        42102,
        "App icon logo mark, Dew Sigil refine v3: minimal flat sigil icon, sharp geometric "
        "cross-lattice with three dew drops at vertices, small amber accent dot at center gate, "
        "forest green #1a5c3a and moss #3d6b4f only, vector-like UI symbol on pure void #0a120e, "
        "centered, high contrast, no scenery no trees no photorealism no text",
    ),
    (
        "logo-refine-moss-vault-v2",
        42103,
        "App icon logo mark, Moss Vault refine: concentric rings forming memory vault, nested "
        "vesica piscis labyrinth, warm amber glow at center like trapped sunlight, forest green "
        "and moss palette, flat vector UI icon not illustration, centered symbol on void #0a120e, "
        "minimal geometric, no text no letters no landscape",
    ),
    (
        "logo-refine-moss-vault-v3",
        42104,
        "App icon logo mark, Moss Vault refine v3: bold concentric circle rings, inner amber "
        "glow core, outer moss green rings, memory vault metaphor, flat icon style, centered on "
        "dark void #0a120e, crisp vector edges, readable at small size, no illustration no scene",
    ),
    (
        "logo-refine-dew-vault-hybrid",
        42105,
        "App icon logo mark, Dew Vault hybrid: geometric dew sigil lattice combined with concentric "
        "vault rings, amber glow center inside vesica gate, three dew droplets on angular frame, "
        "forest emerald and moss green, flat vector UI icon, centered on void #0a120e, minimal, "
        "no text no landscape no trees no illustration",
    ),
]


def main() -> int:
    out_dir = ROOT / "assets" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = {"image_api_provider": "comfyui", "comfyui_url": "http://comfy.example.local:7821"}
    ok = 0
    for name, seed, prompt in REFINES:
        dest = out_dir / f"{name}.png"
        full_prompt = f"{prompt}. Avoid: {NEGATIVE_EXTRA}."
        print(f"Generating {name}...")
        try:
            result = cc.generate_to_path(
                full_prompt,
                dest,
                size="512x512",
                cfg=cfg,
                preset="icon",
                workflow="flux",
                seed=seed,
                quality_tier="final",
                style_bible=STYLE,
                project_style=False,
                background="dark_navy",
                lora="flat-ui",
                lora_strength=0.62,
                asset_type="icon",
                composition_lock="forbid=landscape,scene,trees,illustration,photorealistic",
                workspace=ROOT,
            )
            print(f"  OK: {dest} ({dest.stat().st_size} bytes) seed={result.get('seed')}")
            ok += 1
        except Exception as exc:
            print(f"  FAIL: {exc}")
    print(f"Done: {ok}/{len(REFINES)}")
    return 0 if ok == len(REFINES) else 1


if __name__ == "__main__":
    raise SystemExit(main())
