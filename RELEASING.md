# Releasing Pomnia

One tag, one commit, every platform. Do not rebuild an already published
release from a later commit and upload over it. That is what happened to
v0.1.91: the tag stayed on one commit and the Windows installer was replaced
from another. A fix ships as the next version.

Do not delete or edit an existing GitHub release from this repo's scripts.
Draft v0.1.88 (an orphan `PomniaMini-0.1.88-portable.zip.sha256`, nothing else
worth keeping) is stale. Remove that draft by hand if you want it gone; nothing
here will.

## Cut a release

1. Land the version bump on `master` (`npm run release:win` does this on a
   Windows machine, then packs locally — that local pack is a check, not the
   artifact that gets published).
2. Tag that commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
   The tag must point at the commit you intend to ship. Annotated or
   lightweight both work; `git rev-parse vX.Y.Z^{commit}` is the commit every
   job builds.
3. GitHub Actions, all from that tag:
   - `Release Windows` — installer, Mini zip, and `PomniaMini-win-x64.zip`
   - `Release macOS` — both DMGs, then one merged `latest-mac.yml`
   - `Release Linux` — AppImage, deb, brain-core tarball, `latest-linux.yml`
4. Each job writes `pomnia-<version>.commit` (the full sha) and lowercase
   SHA-256 sidecars (`sha256sum` format). A manifest that mentions a blockmap
   the pack did not produce has that line removed before upload. A blockmap
   that was produced is uploaded with the manifest.
5. When every required asset is on the tag, `npm run promote:release -- --tag vX.Y.Z`
   rewrites the notes from those sidecars through a UTF-8 file (`--notes-file`)
   and undrafts. The workflows also try this when they finish; an incomplete
   tag stays a draft. Do not pass the notes on the `gh` command line — on
   Windows that double-encoded punctuation (v0.1.91's "ÔÇö").

`npm run check:release -- --tag vX.Y.Z` is the list of what is still missing.
It fails if `latest.yml`, `latest-linux.yml` or `latest-mac.yml` names a file
that is not on the release.

Uploads from a machine (`attach:win-release`, `attach:mini-release`,
`attach:linux-release`, `publish:release`) refuse a dirty tree, a checkout that
is not the tagged commit, and any release that is already public.

## Names that do not change

`https://github.com/lobrzut/pomnia/releases/latest/download/PomniaMini-win-x64.zip`
is the Windows Mini link to put on pomnia.ai. The versioned
`PomniaMini-<version>.zip` is the same bytes. Linux Mini, once that pack is
produced, is published as `PomniaMini-linux-x64.AppImage` the same way. This
tree does not build the Linux Mini AppImage; that is the open Mini Linux pull
request. The sealer copies the AppImage to the stable name if it is already in
`release/mini/`.

## What a release must contain

Windows setup.exe and its blockmap, `latest.yml`, both Mac DMGs, `latest-mac.yml`,
Linux AppImage and deb, `latest-linux.yml`, the brain-core tarball, the Mini
zip, `PomniaMini-win-x64.zip`, a `.sha256` sidecar for each of those (lowercase),
and `pomnia-<version>.commit`.

The portable Mini exe is not a release asset. A `*-portable.zip` is not either.
