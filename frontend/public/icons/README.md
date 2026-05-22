# App icons

`icon.svg` is the source-of-truth vector logo. The PNG variants
referenced by `manifest.webmanifest` and `index.html` need to be
generated from it before shipping a build:

- `apple-touch-icon.png` (180×180) — iOS home-screen icon. **Required**
  for the "Add to Home Screen" flow; iOS ignores `manifest.webmanifest`.
- `icon-32.png` (32×32) — browser favicon.
- `icon-192.png` (192×192) — Android home-screen icon (`any`).
- `icon-512.png` (512×512) — Android splash icon (`any`).
- `icon-maskable-512.png` (512×512) — Android adaptive icon (`maskable`).
  Must have the logo within the inner 80% safe zone; the outer 20%
  may be cropped to any shape by the launcher.

One-liner using ImageMagick + librsvg:

```sh
cd frontend/public/icons
for size in 32 180 192 512; do
  rsvg-convert -w $size -h $size icon.svg > icon-${size}.png
done
mv icon-180.png apple-touch-icon.png
# Maskable: pad to 80% safe zone (logo in the central 410×410 area).
rsvg-convert -w 410 -h 410 icon.svg > _logo.png
magick -size 512x512 xc:'#07090f' _logo.png -gravity center -composite icon-maskable-512.png
rm _logo.png
```

Until those PNGs land, the browser falls back to the SVG (modern
browsers; old iOS uses the apple-touch-icon link with no resource and
shows a screenshot of the page).
