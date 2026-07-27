#!/usr/bin/env python3
"""Generate Pomnia Slavic logo concept PNGs via ComfyUI ISKRA.

Usage:
  python scripts/gen-logo-concepts.py              # original flat concepts (archived)
  python scripts/gen-logo-concepts.py --depth      # anti-flat depth pass (recommended)
  python scripts/gen-logo-concepts.py --final      # depth refinements from user picks
  python scripts/gen-logo-concepts.py --bold-a     # Ostry sigil — sharp angular (5 variants)
  python scripts/gen-logo-concepts.py --bold-b     # Rytuał skarbca — ritual vault (5 variants)
  python scripts/gen-logo-concepts.py --bold       # both bold series (10 images)
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

FORBID_MILD = (
    "soft, mild, generic, corporate, rounded friendly app icon, pastel, dribbble, "
    "subtle, bland, flat design, minimalist vector, gradient squircle, Lory style, "
    "soft glow, cute, illustration, game UI, behance flat"
)

STYLE_BOLD = (
    "Pomnia Slavic memory vault BOLD: emerald #1a5c3a, moss #3d6b4f, amber #c9a227 ONLY, "
    "void #0a120e background. HIGH CONTRAST carved emblem, aggressive folk-art angles, "
    "sharp crystal facets, iron patina, cracked bark, weathered stone, handmade artifact. "
    "Strong rim light, chiaroscuro, monumental sculptural relief NOT illustration. "
    "FORBID soft mild generic corporate rounded pastel dribbble subtle bland flat vector. "
    "No purple cyan, no text, no light bulb."
)

# Series A: Ostry sigil — sharp angular Dew Sigil evolution
CONCEPTS_BOLD_A = [
    (
        "logo-bold-sigil-v1",
        43101,
        "App icon logo mark, Ostry Sigil BOLD concept: razor-sharp angular lattice sigil "
        "carved deep into black volcanic stone, aggressive Slavic folk-art geometry with "
        "hard chisel cuts not soft curves, three dew drops as sharp crystal facets catching "
        "strong amber rim light, vesica memory gate as angular portal recess, high contrast "
        "emerald and amber ONLY on void #0a120e, dramatic chiaroscuro sculptural relief, "
        "hand-forged artifact feel, centered symbol only, no scene no landscape no text",
    ),
    (
        "logo-bold-sigil-v2",
        43287,
        "App icon logo mark, Ostry Sigil BOLD v2: brutalist angular sigil emblem, intersecting "
        "sharp geometric blades forming memory gate, dew droplets as cut glass diamond facets "
        "not soft blobs, deep engraved channels with moss green patina, blazing amber fire "
        "core in center vesica, iron and stone texture, aggressive original Slavic geometry "
        "not runes, void black background strong side lighting, monumental carved object, "
        "no rounded friendly icon no text",
    ),
    (
        "logo-bold-sigil-v3",
        43433,
        "App icon logo mark, Ostry Sigil BOLD v3: spiked angular cross-lattice sigil, sharp "
        "triangular dew crystals at vertices, carved amber inlay lines in dark emerald stone, "
        "vesica gate as sharp almond portal with inner amber blaze, folk-art woodcut influence "
        "with 3D depth, cracked stone surface, high contrast emerald amber only, void #0a120e, "
        "tactile handmade artifact not corporate icon, centered emblem, no soft edges no text",
    ),
    (
        "logo-bold-sigil-v4",
        43621,
        "App icon logo mark, Ostry Sigil BOLD v4: jagged geometric sigil like ancient ritual "
        "brand burned into dark petrified wood, sharp angular lattice with deep relief shadows, "
        "three faceted crystal dew drops refracting amber light, vesica threshold carved as "
        "aggressive almond gate, Slavic folk art sharp angles original not Elder Futhark, "
        "moss in deep grooves iron oxidized edges, strong rim light void background, "
        "sculptural emblem only no illustration no text",
    ),
    (
        "logo-bold-sigil-v5",
        43891,
        "App icon logo mark, Ostry Sigil BOLD v5: maximum contrast angular memory sigil, "
        "sharp intersecting geometric arms like sacred threshold cross, dew as razor-cut amber "
        "crystal shards on lattice nodes, vesica gate glowing molten amber from within dark "
        "emerald stone frame, hand-carved aggressive folk motif, weathered artifact patina, "
        "dramatic top-down rim lighting, void #0a120e, bold unique memorable symbol, "
        "no soft mild generic rounded no text no letters",
    ),
]

# Series B: Rytuał skarbca — monumental Moss Vault ritual gate
CONCEPTS_BOLD_B = [
    (
        "logo-bold-vault-v1",
        44101,
        "App icon logo mark, Rytual Skarbca BOLD concept: ancient ritual gate threshold, "
        "concentric rings like sacred Slavic labyrinth carved in weathered dark stone, amber "
        "fire core blazing at center like trapped ancestral memory, cracked bark texture on "
        "outer ring iron patina on inner grooves, moss growing in stone crevices, monumental "
        "handmade artifact not cute not illustration, vesica portal tunnel depth, emerald "
        "and amber ONLY void #0a120e, strong dramatic rim light, centered emblem no scene no text",
    ),
    (
        "logo-bold-vault-v2",
        44297,
        "App icon logo mark, Rytual Skarbca BOLD v2: moss vault as ritual stone portal, "
        "deep concentric labyrinth rings engraved with Slavic woven border geometry original, "
        "molten amber resin pool at center glowing through ring gaps, weathered granite with "
        "cracked bark and iron rust patina, lush moss in carved channels, monumental sacred "
        "threshold not game UI, tactile sculptural relief high contrast, void black background "
        "emerald amber palette, centered symbol only no landscape no text",
    ),
    (
        "logo-bold-vault-v3",
        44513,
        "App icon logo mark, Rytual Skarbca BOLD v3: memory vault as ancient iron-bound stone "
        "door, concentric ritual rings forming labyrinth mandorla portal, blazing amber core "
        "like forge fire in center, heavy weathered stone with moss lichen in cracks, "
        "hand-forged iron bands with green patina, Slavic folk art border engraving bold and "
        "original, monumental artifact feel dramatic chiaroscuro, void #0a120e, no soft glow "
        "no cute fantasy no text",
    ),
    (
        "logo-bold-vault-v4",
        44707,
        "App icon logo mark, Rytual Skarbca BOLD v4: sacred threshold gate with nested vesica "
        "tunnel rings, labyrinth concentric circles carved deep in petrified wood and stone, "
        "amber fire heart pulsing at center, cracked bark outer texture iron rivets inner ring, "
        "moss emerald in deep grooves, handmade ritual artifact monumental not illustration, "
        "aggressive depth and shadow, strong side lighting void background, emerald amber only "
        "centered emblem no scene no text no letters",
    ),
    (
        "logo-bold-vault-v5",
        44999,
        "App icon logo mark, Rytual Skarbca BOLD v5: ultimate ritual memory vault portal, "
        "massive concentric labyrinth rings like Slavic sacred circle, weathered stone and "
        "forged iron with amber magma glow at vesica center, cracked ancient bark texture "
        "moss in crevices iron oxide patina, bold original folk border geometry, monumental "
        "sculptural gate threshold handmade artifact, maximum contrast emerald amber void "
        "#0a120e, dramatic rim light, no soft mild generic game icon no text",
    ),
]

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
    bold: bool = False,
) -> int:
    out_dir = ROOT / "assets" / "generated"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = {"image_api_provider": "comfyui", "comfyui_url": "http://comfy.example.local:7821"}
    ok = 0
    for name, seed, prompt in concepts:
        dest = out_dir / f"{name}.png"
        print(f"Generating {name}...")
        if bold:
            style_bible = STYLE_BOLD
            lora = "none"
            composition_lock = f"forbid={FORBID_MILD}"
        elif depth:
            style_bible = STYLE_DEPTH
            lora = "none"
            composition_lock = f"forbid={FORBID_FLAT}"
        else:
            style_bible = STYLE_FLAT
            lora = "flat-ui"
            composition_lock = None
        kwargs: dict = {
            "size": "512x512",
            "cfg": cfg,
            "preset": "icon",
            "workflow": "flux",
            "seed": seed,
            "quality_tier": "final",
            "style_bible": style_bible,
            "project_style": False,
            "background": "dark_navy",
            "asset_type": "icon",
            "workspace": ROOT,
        }
        if bold or depth:
            kwargs["lora"] = lora
            kwargs["composition_lock"] = composition_lock
        else:
            kwargs["lora"] = lora
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
    parser.add_argument(
        "--bold-a",
        action="store_true",
        help="Series A: Ostry sigil — sharp angular (5 variants)",
    )
    parser.add_argument(
        "--bold-b",
        action="store_true",
        help="Series B: Rytuał skarbca — ritual vault (5 variants)",
    )
    parser.add_argument(
        "--bold",
        action="store_true",
        help="Both bold series (10 images)",
    )
    args = parser.parse_args()
    if args.bold or (args.bold_a and args.bold_b):
        concepts = CONCEPTS_BOLD_A + CONCEPTS_BOLD_B
        return generate_batch(concepts, depth=False, bold=True)
    if args.bold_a:
        return generate_batch(CONCEPTS_BOLD_A, depth=False, bold=True)
    if args.bold_b:
        return generate_batch(CONCEPTS_BOLD_B, depth=False, bold=True)
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
