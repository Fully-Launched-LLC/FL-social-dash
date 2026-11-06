# One animation for the emails: the full Fully Launched logo, with a platinum
# shine sweeping across it, then a long still hold. Frame 1 is the whole logo
# (Outlook and others show only the first frame). Solid #04101f background so
# it sits on the email with no box.
import sys
from PIL import Image, ImageFilter, ImageChops
src, out = sys.argv[1], sys.argv[2]
BG = (4, 16, 31)
logo = Image.open(src).convert("RGBA")
W, H = logo.size
pad_x, pad_y = 40, 34
cw, ch = W + 2 * pad_x, H + 2 * pad_y
mask = Image.new("L", (cw, ch), 0); mask.paste(logo.split()[3], (pad_x, pad_y))
glow = mask.filter(ImageFilter.GaussianBlur(10))
BASE = (178, 190, 208)   # platinum
def frame(pos):
    """pos: centre of the shine band, in px along x (None = no shine)."""
    img = Image.new("RGB", (cw, ch), BG)
    shine = Image.new("L", (cw, ch), 0)
    if pos is not None:
        px = shine.load()
        for y in range(ch):
            for x in range(cw):
                d = abs((x + (y - ch / 2) * 0.45) - pos)
                if d < 70: px[x, y] = int(255 * (1 - d / 70) ** 1.3)
    # soft halo where the shine is
    halo = ImageChops.multiply(glow, shine).point(lambda v: v * 0.9)
    img = Image.composite(Image.new("RGB", (cw, ch), (150, 180, 230)), img, halo)
    body = Image.new("RGB", (cw, ch), BASE)
    white = Image.new("RGB", (cw, ch), (255, 255, 255))
    body = Image.composite(white, body, shine)
    img = Image.composite(body, img, mask)
    return img
frames, durs = [frame(None)], [2400]
steps = 22
for i in range(steps + 1):
    frames.append(frame(-60 + (cw + 120) * i / steps)); durs.append(55)
frames.append(frame(None)); durs.append(1200)
pal = frames[1].quantize(colors=96, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True, disposal=1)
print(cw, ch)
