#!/usr/bin/env python3
"""Optimize ClimaRadar site images in WebP and preserve legacy compatibility fallbacks."""
from pathlib import Path
from PIL import Image
import re

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

def compress(original, out_name, dims, quality):
    origin = ASSETS / original
    target = ASSETS / out_name
    if target.exists():
        try:
            img = Image.open(target)
            if img.format == "WEBP" and img.size == dims:
                print("already optimized:", target.name)
                return
        except Exception:
            pass
    with Image.open(origin) as img:
        if img.size != dims:
            img = img.resize(dims, Image.Resampling.LANCZOS)
        img.save(target, "WEBP", quality=quality, method=4, exact=False)
    with Image.open(target) as result:
        assert result.size == dims and result.format == "WEBP"
    print("optimized:", target.name, target.stat().st_size)

compress("climaradar-icon.webp", "climaradar-icon.webp", (160, 160), 83)
compress("climaradar-radar-art.webp", "climaradar-radar-art.webp", (400, 300), 80)
compress("climaradar-wordmark.webp", "climaradar-wordmark.webp", (780, 260), 83)
compress("climaradar-social.jpg", "climaradar-social.webp", (1200, 630), 75)
compress("climaradar-favicon.png", "climaradar-favicon.webp", (64, 64), 87)
compress("climaradar-hero.webp", "climaradar-hero-mobile.webp", (520, 293), 77)

html = ROOT / "index.html"
s = html.read_text(encoding="utf-8")
s = s.replace('  <link rel="icon" type="image/svg+xml" href="./assets/favicon.svg" />',
              '  <link rel="icon" type="image/webp" sizes="64x64" href="./assets/climaradar-favicon.webp" />')
old_og = '  <meta property="og:image" content="https://jogoiarexx-blip.github.io/Clima-Radar-Brasil/assets/climaradar-social.jpg" />'
new_og = ('  <meta property="og:image" content="https://jogoiarexx-blip.github.io/Clima-Radar-Brasil/assets/climaradar-social.webp" />\n'
          '  <meta property="og:image:type" content="image/webp" />\n'
          '  <meta name="twitter:image" content="https://jogoiarexx-blip.github.io/Clima-Radar-Brasil/assets/climaradar-social.webp" />')
s = s.replace(old_og, new_og)
old_hero = '        <img class="hero-art" src="./assets/climaradar-hero.webp" alt="" aria-hidden="true" width="1050" height="591" fetchpriority="low" decoding="async" />'
new_hero = ('        <picture class="hero-art" aria-hidden="true">\n'
            '          <source media="(max-width: 600px)" type="image/webp" srcset="./assets/climaradar-hero-mobile.webp" />\n'
            '          <img src="./assets/climaradar-hero.webp" alt="" width="1050" height="591" decoding="async" fetchpriority="low" />\n'
            '        </picture>')
s = s.replace(old_hero, new_hero)
s = s.replace('width="460" height="153" loading="lazy" decoding="async" alt="ClimaRadar Brasil — previsão multimodelo"',
              'width="780" height="260" loading="lazy" decoding="async" alt="ClimaRadar Brasil — previsão multimodelo"')
html.write_text(s, encoding="utf-8")

css = ROOT / "premium.css"
c = css.read_text(encoding="utf-8")
extra = '\n/* WebP responsivo: arte do hero adequada ao desktop e celular */\n.hero-art img { display:block; width:100%; height:auto; }\n'
if '.hero-art img {' not in c:
    css.write_text(c + extra, encoding="utf-8")

readme = ROOT / "README.md"
r = readme.read_text(encoding="utf-8")
note = ("\n\n## Imagens WebP otimizadas\n\n"
        "Ícone 160×160; radar 400×300; logotipo 780×260; "
        "favicon 64×64 e banner social 1200×630 em WebP. "
        "A hero image de 1050×591 continua no desktop; o celular usa "
        "uma versão 520×293 via picture. O PNG de favicon e o JPG social "
        "são preservados como arquivos de compatibilidade.\n")
if '## Imagens WebP otimizadas' not in r:
    readme.write_text(r + note, encoding="utf-8")

for item in ["climaradar-icon.webp", "climaradar-radar-art.webp", "climaradar-wordmark.webp",
             "climaradar-social.webp", "climaradar-favicon.webp", "climaradar-hero-mobile.webp"]:
    with Image.open(ASSETS / item) as image:
        image.verify()
print("all optimized assets verified")
