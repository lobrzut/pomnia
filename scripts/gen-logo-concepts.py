#!/usr/bin/env python3
"""Generate Pomnia Slavic logo concept PNGs via ComfyUI ISKRA.

Usage:
  python scripts/gen-logo-concepts.py              # original flat concepts (archived)
  python scripts/gen-logo-concepts.py --depth      # anti-flat depth pass (recommended)
  python scripts/gen-logo-concepts.py --final      # depth refinements from user picks
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MCP = Path(__file__).resolve().parents[2] / "comfyui-cursor-mcp"
sys.path.insert(0, str(MCP))

from comfyui_cursor_mcp import comfy_client as cc  # noqa: E402

STYLE_FLAT = (
    "Pomnia Slavic memory vault brand: forest emerald #1a5c3a, moss #3d6b4f, "
    "birch silver-green #a8c4b0, amber accent #c9a227, void #0a120e. "
    "Flat vector icon, original Slavic geometry, no cliche eagles wolves, "
    "no purple cyan, no text, no photorealism."
)

STYLE_DEPTH = (
    "Pomnia Slavic memory vault: forest emerald #1a5c3a, moss #3d6b4f, "
    "birch #a8c4b0, amber #c9a227, void #0a120e. "
    "FORBID flat design, minimalist vector logo, corporate app icon, gradient squircle, "
    "generic tech logo, dribbble logo, behance flat icon, Lory style. "
    "SEEK dimensional depth, subtle emboss engraving, organic texture moss bark amber resin, "
    "hand-crafted feel, Slavic folk art influence, carved wood or amber inlay, "
    "atmospheric rim lighting. Symbolic object with depth NOT illustration scene. "
    "No purple cyan, no text, no light bulb."
)

FORBID_FLAT = (
    "flat design,minimalist vector,corporate app icon,gradient squircle,"
    "dribbble,behance flat,Lory style"
)

CONCEPTS_FLAT = [
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

CONCEPTS_DEPTH = [
    (
        "logo-depth-moss-vault-v1",
        42051,
        "App icon logo mark, Moss Vault depth concept: concentric rings carved into dark "
        "forest stone like a memory tunnel vault, volumetric amber glow emanating from "
        "center like trapped sunlight in resin, moss texture on ring edges and crevices, "
        "subtle emboss and engraved Slavic woven border geometry original not Elder Futhark, "
        "hand-crafted carved wood and amber inlay feel, dimensional depth with atmospheric "
        "rim lighting, emerald moss green palette void background #0a120e, birch silver-green "
        "highlights, tactile organic surface, centered symbol generous padding, symbolic "
        "object only no scene no landscape, no text no letters",
    ),
    (
        "logo-depth-moss-vault-v2",
        42052,
        "App icon logo mark, Moss Vault depth concept: nested vesica piscis tunnel carved "
        "in aged dark stone with deep relief, concentric ring grooves filled with moss and "
        "birch lichen, inner amber resin pool glowing volumetrically, Slavic folk art border "
        "engraving subtle and original, hand-carved tactile emblem not flat vector, dramatic "
        "side lighting revealing depth, forest emerald and void #0a120e, centered symbol, "
        "no text no letters no flat design",
    ),
    (
        "logo-depth-dew-sigil-v1",
        42053,
        "App icon logo mark, Dew Sigil depth concept: original angular lattice sigil carved "
        "and engraved into dark stone or polished amber slab, three dew droplets as small 3D "
        "glass beads catching rim light, vesica memory gate recessed at center with subtle "
        "emboss, Slavic folk art geometric influence hand-crafted not rune alphabet, moss and "
        "bark micro-texture in grooves, dimensional depth atmospheric lighting, emerald green "
        "with amber resin highlights, void background #0a120e, symbolic carved object only "
        "no landscape no trees no scene, no text",
    ),
    (
        "logo-depth-dew-sigil-v2",
        42054,
        "App icon logo mark, Dew Sigil depth concept: geometric memory sigil deeply engraved "
        "in dark petrified wood with amber inlay lines, three spherical dew beads of polished "
        "glass on lattice intersections catching light, vesica gate carved recess with inner "
        "amber glow, tactile hand-crafted Slavic folk motif not Elder Futhark, rich moss green "
        "patina in carved channels, sculptural emblem with shadow and relief, void #0a120e "
        "background, centered symbol only, no flat vector no corporate icon no text",
    ),
    (
        "logo-depth-dew-vault-hybrid",
        42055,
        "App icon logo mark, Dew Vault hybrid depth concept: angular dew sigil lattice merged "
        "with concentric moss vault rings, carved in dark stone with amber resin inlay at center, "
        "three 3D dew beads on sigil nodes, tunnel-like ring depth with moss texture on edges, "
        "hand-crafted Slavic folk engraving, volumetric amber glow from vault core, dimensional "
        "relief not flat vector, void #0a120e, symbolic object only no scene, no text no letters",
    ),
]

# Final refinements — user picks: depth-moss-vault-v2 + depth-dew-sigil-v1 (2026-07-07)
CONCEPTS_FINAL = [
    (
        "logo-final-moss-vault-v1",
        42061,
        "App icon logo mark, Moss Vault depth FINAL refinement: nested vesica piscis memory "
        "tunnel carved in aged dark stone with deep relief, concentric ring grooves filled with "
        "lush moss and birch lichen, inner amber resin pool glowing volumetrically from center, "
        "Slavic folk art border engraving refined and crisp, hand-carved tactile emblem with "
        "dramatic chiaroscuro side lighting, forest emerald and void #0a120e, centered symbol "
        "generous padding, symbolic object only, ultra detailed moss texture, no flat vector "
        "no text no letters",
    ),
    (
        "logo-final-moss-vault-v2",
        42062,
        "App icon logo mark, Moss Vault depth FINAL refinement: concentric memory vault rings "
        "deeply embossed in dark petrified wood, vesica mandorla forming tunnel portal, amber "
        "resin veins glowing through moss-covered grooves, original Slavic woven border geometry "
        "engraved, sculptural relief with atmospheric rim lighting, emerald moss birch palette "
        "void #0a120e, centered emblem crisp edges for small size readability, no scene no "
        "landscape no text no flat design",
    ),
    (
        "logo-final-dew-sigil-v1",
        42063,
        "App icon logo mark, Dew Sigil depth FINAL refinement: original angular lattice sigil "
        "precisely carved in dark polished stone, three glass dew droplets as luminous 3D beads "
        "on key nodes catching rim light, vesica memory gate recessed at center with amber glow, "
        "Slavic folk art geometric lines clean and bold, moss micro-texture in engraved channels, "
        "dimensional depth sculptural emblem, void #0a120e, centered single symbol only no "
        "landscape, no text no flat vector",
    ),
    (
        "logo-final-dew-sigil-v2",
        42064,
        "App icon logo mark, Dew Sigil depth FINAL refinement: geometric memory sigil deeply "
        "engraved in amber inlay slab with dark stone frame, three spherical dew beads of "
        "polished crystal on lattice intersections, vesica gate with inner emerald glow, "
        "hand-crafted Slavic folk motif crisp angular geometry not runes, rich moss green patina "
        "in carved channels, dramatic sculptural relief shadow and highlight, void background "
        "#0a120e, centered symbol only, no corporate icon no text",
    ),
    (
        "logo-final-depth-hybrid",
        42065,
        "App icon logo mark, Depth hybrid FINAL: angular dew sigil lattice merged with "
        "concentric moss vault rings in single carved emblem, dark stone with amber resin inlay "
        "at vesica center, three 3D dew beads on sigil nodes, tunnel-like ring depth with lush "
        "moss on edges, hand-crafted Slavic folk engraving unified composition, volumetric amber "
        "glow from vault core through sigil gate, dimensional relief sculptural not flat vector, "
        "void #0a120e, centered symbolic object only, no scene no text no letters",
    ),
]


def generate_batch(
    concepts: list[tuple[str, int, str]],
    *,
    depth: bool,
) -> int:
    out_dir = ROOT / "assets" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = {"image_api_provider": "comfyui", "comfyui_url": "http://brain.example.local:7821"}
    ok = 0
    for name, seed, prompt in concepts:
        dest = out_dir / f"{name}.png"
        print(f"Generating {name}...")
        kwargs: dict = {
            "size": "512x512",
            "cfg": cfg,
            "preset": "icon",
            "workflow": "flux",
            "seed": seed,
            "quality_tier": "final",
            "style_bible": STYLE_DEPTH if depth else STYLE_FLAT,
            "project_style": False,
            "background": "dark_navy",
            "asset_type": "icon",
            "workspace": ROOT,
        }
        if depth:
            kwargs["lora"] = "none"
            kwargs["composition_lock"] = f"forbid={FORBID_FLAT}"
        else:
            kwargs["lora"] = "flat-ui"
            kwargs["lora_strength"] = 0.55
        try:
            result = cc.generate_to_path(prompt, dest, **kwargs)
            print(f"  OK: {dest} ({dest.stat().st_size} bytes) seed={result.get('seed')}")
            ok += 1
        except Exception as exc:
            print(f"  FAIL: {exc}")
    print(f"Done: {ok}/{len(concepts)}")
    return 0 if ok == len(concepts) else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--depth",
        action="store_true",
        help="Generate anti-flat depth pass (no flat-ui LoRA)",
    )
    parser.add_argument(
        "--final",
        action="store_true",
        help="Generate depth refinements from user shortlist picks",
    )
    args = parser.parse_args()
    if args.final:
        concepts = CONCEPTS_FINAL
        depth = True
    elif args.depth:
        concepts = CONCEPTS_DEPTH
        depth = True
    else:
        concepts = CONCEPTS_FLAT
        depth = False
    return generate_batch(concepts, depth=depth)


if __name__ == "__main__":
    raise SystemExit(main())
