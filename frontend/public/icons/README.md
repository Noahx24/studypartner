# App icons

`icon.svg` is the source-of-truth vector logo. The PNG variants
referenced by `manifest.webmanifest` and `index.html` are present in
this directory and generated from `icon.svg`:

| File                       | Size    | Purpose |
| -------------------------- | ------- | ------- |
| `apple-touch-icon.png`     | 180×180 | iOS home-screen icon (iOS ignores manifest.webmanifest) |
| `icon-32.png`              | 32×32   | Browser favicon |
| `icon-192.png`             | 192×192 | Android home-screen icon (`any`) |
| `icon-512.png`             | 512×512 | Android splash icon (`any`) |
| `icon-maskable-512.png`    | 512×512 | Android adaptive icon (`maskable`) — logo within central 80% safe zone |

Re-generate after editing `icon.svg`:

```sh
cd frontend/public/icons
python <<'PY'
import cairosvg, io
from PIL import Image

for name, size in (
    ("apple-touch-icon.png", 180),
    ("icon-32.png", 32),
    ("icon-192.png", 192),
    ("icon-512.png", 512),
):
    cairosvg.svg2png(url="icon.svg", output_width=size, output_height=size, write_to=name)

inner = Image.open(io.BytesIO(
    cairosvg.svg2png(url="icon.svg", output_width=410, output_height=410)
)).convert("RGBA")
bg = Image.new("RGBA", (512, 512), "#07090f")
bg.paste(inner, ((512 - 410) // 2, (512 - 410) // 2), inner)
bg.convert("RGB").save("icon-maskable-512.png", "PNG")
PY
```

Requires `pip install cairosvg pillow`. Alternative tools that work
the same way: `rsvg-convert` (librsvg) + `magick` (ImageMagick).
