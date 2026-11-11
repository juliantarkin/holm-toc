"""Labelled contact sheets from the native Blender renders (system Python + Pillow). Usage: py contact_sheets.py <craft-folder>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(sys.argv[1]); R = folder / 'renders'; out = folder / 'review'; out.mkdir(exist_ok=True)
groups = {}
for p in sorted(R.glob('*.png')):
    key = p.stem.split('_')[0]
    if key.startswith('standard') or key.startswith('lod'):
        parts = p.stem.split('_')
        key = 'lods' if (parts[0] == 'standard' or parts[-1] == 'small' or 'small' in parts) else '_'.join(parts[:2])
    groups.setdefault(key, []).append(p)
for key, files in groups.items():
    cell = 520; cols = min(4, len(files)); rows = (len(files) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell, rows * (cell + 22)), (20, 20, 22)); d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB'); im.thumbnail((cell, cell))
        x = (i % cols) * cell; y = (i // cols) * (cell + 22)
        sheet.paste(im, (x, y + 22)); d.text((x + 6, y + 5), f.stem, fill=(255, 255, 255))
    sheet.save(out / f'contact_{key}.png')
    print(out / f'contact_{key}.png', len(files))
