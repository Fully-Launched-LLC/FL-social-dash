# Hesedea: how Tait grades it (DaVinci Resolve, HoneyGlaze LUT)

Tait, 2026-10-23: "I am just giving you this so that you know how to colorgrade Hesedea clips."
This is how he graded the first Hesedea video. Use it for every Hesedea clip.

**LUT:** HoneyGlaze.cube (Dante's LUT Pack, All Cameras).
- In Assets: LUTs and Powergrades / Dante's LUT Pack / All Cameras / HoneyGlaze.cube (one of Hesedea's favourites)
- Editor's folder: `editor/public/clients/hesedea/_assets/`
- Original on the drive: `/Volumes/Crucial X10/Assets /Colorgrading/LUTs/Dante's LUT Pack/All Cameras/HoneyGlaze.cube`

**Footage:** Sony, S-Log3 / S-Gamut3.

## The node tree, in order

1. **Input transform.** Color Space Transform from Sony S-Gamut3 / S-Log3 to DaVinci Wide Gamut / DaVinci Intermediate.
2. **Exposure.** Bring exposure down a bit (the first shot was a little overexposed). Set it by eye for each shot.
3. **White balance.** Turn on linear gamma, then pull the Gain wheel down toward the bottom of the circle, toward green and blue.
4. **Contrast.** A small S-curve.
5. **Balanced saturation.** Set the node's colour space to HSV, turn off channels 1 and 3 (so only saturation is affected), and raise Gain. Only the tiniest bit: it should look natural.
6. **Speaker stands out.** Draw a mask around the speaker, add an outside node, and lower the exposure outside the mask (a soft vignette around them).
7. **Look.** The HoneyGlaze LUT, near the end.
8. **Output transform.** Out to Rec.709, gamma Rec.709-A.

## Notes for the team
- The amounts are small: a little less exposure if it's hot, the tiniest bit of saturation, a slight S-curve. If it looks graded, it's too much.
- Skin stays natural (Color Grader rule: never push skin orange, crush blacks or blow out windows).
- The Rec.709-A gamma is meant for watching on Apple devices and phones, which is how the posts get seen.
- The older ffmpeg look (`warm-glow.txt`) was built before Tait shared this. When this and `warm-glow.txt` disagree, follow this file. To match Tait's grade in an AI edit, build the ffmpeg version from these steps (HoneyGlaze can be applied with `lut3d=file=...`, in the colour space it is meant for) and ask Tait to compare it with his own grade before using it.
