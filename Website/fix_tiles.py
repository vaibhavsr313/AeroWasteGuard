from PIL import Image
import os

TILES_DIR = r"C:\BE\Project\Website\AeroWasteGuard\tiles\orthophoto"
THRESHOLD = 240  # pixels brighter than this = blank/white

converted = 0
deleted   = 0

for root, dirs, files in os.walk(TILES_DIR):
    for filename in files:
        if not filename.endswith('.jpg'):
            continue

        filepath = os.path.join(root, filename)
        img = Image.open(filepath).convert("RGBA")
        pixels = img.getdata()

        # Check if tile is mostly white/blank
        white_pixels = sum(
            1 for r, g, b, a in pixels
            if r > THRESHOLD and g > THRESHOLD and b > THRESHOLD
        )
        total_pixels = len(pixels)
        white_ratio  = white_pixels / total_pixels

        if white_ratio > 0.98:
            # Tile is 98%+ white — just delete it
            # Leaflet shows nothing for missing tiles (transparent)
            os.remove(filepath)
            deleted += 1

        else:
            # Tile has real data — convert white areas to transparent
            new_pixels = []
            for r, g, b, a in pixels:
                if r > THRESHOLD and g > THRESHOLD and b > THRESHOLD:
                    new_pixels.append((255, 255, 255, 0))  # transparent
                else:
                    new_pixels.append((r, g, b, 255))      # keep pixel

            img.putdata(new_pixels)

            # Save as PNG (JPG cannot store transparency)
            png_path = filepath.replace('.jpg', '.png')
            img.save(png_path, 'PNG')
            os.remove(filepath)  # remove old jpg
            converted += 1

        if (converted + deleted) % 100 == 0:
            print(f"Processed {converted + deleted} tiles...")

print(f"\nDone!")
print(f"  Deleted blank tiles:   {deleted}")
print(f"  Converted to PNG:      {converted}")