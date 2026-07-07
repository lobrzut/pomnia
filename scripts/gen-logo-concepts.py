#!/usr/bin/env python3
"""One-off: generate Pomnia Slavic logo concept PNGs via ComfyUI ISKRA."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MCP = Path(__file__).resolve().parents[2] / "comfyui-cursor-mcp"
sys.path.insert(0, str(MCP))

from comfyui_cursor_mcp import comfy_client as cc  # noqa: E402

STYLE = (
    "Pomnia Slavic memory vault brand: forest emerald #1a5c3a, moss #3d6b4f, "
    "birch silver-green #a8c4b0, amber accent #c9a227, void #0a120e. "
    "Flat vector icon, original Slavic geometry, no cliche eagles wolves, "
    "no purple cyan, no text, no photorealism."
)

CONCEPTS = [
    (
        "logo-concept-moss-vault",
        42001,
        "App icon logo mark, Moss Vault concept: nested vesica piscis forming a memory "
        "labyrinth vault, inner amber glow like trapped sunlight in forest moss, emerald "
        "and moss green palette, subtle Slavic woven border geometry original not Elder "
        "Futhark, flat vector UI icon, centered symbol generous padding, dark forest void "
        "background, birch silver-green highlights, minimal geometric, no text no letters",
    ),
    (
        "logo-concept-birch-thread",
        42002,
        "App icon logo mark, Birch Thread concept: three interwoven memory threads forming "
        "abstract knot, inspired by Slavic haft embroidery and birch bark texture, "
        "silver-green birch and deep forest green, delicate cross-stitch geometry, "
        "dreamcatcher-like thread nodes at intersections, flat vector UI icon, centered, "
        "dark background, minimal, no text",
    ),
    (
        "logo-concept-dew-sigil",
        42003,
        "App icon logo mark, Dew Sigil concept: original runic geometry sigil not Elder "
        "Futhark copy, morning dew droplets on angular lattice, vesica memory gate at "
        "center, emerald green glow with amber dew highlights, Slavic sacred geometry "
        "reinterpreted, flat vector UI icon, centered symbol, dark forest background, "
        "crisp edges, no text no rune alphabet",
    ),
    (
        "logo-concept-amber-loom",
        42004,
        "App icon logo mark, Amber Loom concept: circular memory loom weaving ancestral "
        "knowledge threads, amber resin glow at center like preserved memory, moss green "
        "and emerald outer ring, subtle Slavic sun-wheel geometry reimagined as loom "
        "spokes not kolovrat copy, flat vector UI icon, centered, dark void background, "
        "minimal geometric, no text",
    ),
]


def main() -> int:
    out_dir = ROOT / "assets" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = {"image_api_provider": "comfyui", "comfyui_url": "http://brain.example.local:7821"}
    ok = 0
    for name, seed, prompt in CONCEPTS:
        dest = out_dir / f"{name}.png"
        print(f"Generating {name}...")
        try:
            result = cc.generate_to_path(
                prompt,
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
                lora_strength=0.55,
                asset_type="icon",
                workspace=ROOT,
            )
            print(f"  OK: {dest} ({dest.stat().st_size} bytes) seed={result.get('seed')}")
            ok += 1
        except Exception as exc:
            print(f"  FAIL: {exc}")
    print(f"Done: {ok}/{len(CONCEPTS)}")
    return 0 if ok == len(CONCEPTS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
