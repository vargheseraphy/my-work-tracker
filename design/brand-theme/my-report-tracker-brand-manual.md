# My Report & Tracker brand manual

Version 1.0, October 2026. This is the visual system for My Report & Tracker, the daily GTM activity dashboard. The look is bright glass with quiet ink text and tight corners, in light and dark themes.

The orb style is an original recreation in CSS. It contains no third-party imagery, logos or fonts.

---

## 1. Principles

1. **Readable first.** Text is never light grey. Every text colour passes WCAG AAA (7:1) on its surface, in both themes.
2. **Glass sits on colour.** Glass panels only appear over an orb or aurora ground. On a plain canvas they look like dirty white boxes.
3. **Tight corners.** Buttons are 4px, cards are 10px and glass is 14px. Nothing is a pill.
4. **One bold moment per screen.** One ground, one accent button and one Prism Edge panel at most.

---

## 2. Colour

### Core tokens

| Token | Name | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | Canvas | `#F5F4FA` | `#070B16` | Page background |
| `--surface` | Surface | `#FFFFFF` | `#0F1626` | Cards, inputs, tables |
| `--surface-2` | Surface 2 | `#EFEDF7` | `#17213A` | Table heads, hover, tracks |
| `--line` | Hairline | `#D5D8E3` | `#2B3756` | Borders and dividers |
| `--ink` | Ink | `#0B1424` | `#F5F7FC` | Headings, body, primary buttons |
| `--ink-2` | Ink 2 | `#1B2A44` | `#E0E6F2` | Labels, secondary text |
| `--muted` | Muted text | `#34415A` | `#C3CCDD` | Hints, captions (lowest text tone allowed) |
| `--accent` | Accent | `#4B3FD1` | `#A79DFF` | One main action per view, focus rings |
| `--link` | Link | `#0052A3` | `#8CC6FF` | Inline links |

### Status

| Token | Light text / tint | Dark text / tint | Example label |
|---|---|---|---|
| `--good` / `--good-bg` | `#0A6B34` / `#E3F5EA` | `#6BDCA2` / `#0F3324` | Positive, Target met |
| `--warn` / `--warn-bg` | `#8A4200` / `#FFF0DD` | `#FFBE70` / `#3A2610` | No reply, Behind target |
| `--bad` / `--bad-bg` | `#A61D12` / `#FDE6E3` | `#FF9A8C` / `#3D1713` | Negative, Lost |

Always pair a status colour with a word. Colour alone is never the signal.

### Chart categories

| Token | Activity | Light | Dark |
|---|---|---|---|
| `--c1` | Call | `#4B3FD1` | `#A79DFF` |
| `--c2` | Email | `#0B74B8` | `#5CC3FF` |
| `--c3` | LinkedIn | `#08806F` | `#3FD6C0` |
| `--c4` | Meeting | `#B86A00` | `#FFB547` |
| `--c5` | Proposal | `#B5287A` | `#FF86C8` |
| `--c6` | Event | `#4D5872` | `#AEB9D0` |

### Orb hues (backgrounds and glass only, never text)

| Token | Light | Dark |
|---|---|---|
| `--orb-violet` | `#A493FF` | `#5B45E8` |
| `--orb-cyan` | `#6FD3FF` | `#0E86C2` |
| `--orb-peach` | `#FFBE98` | `#C2643C` |
| `--orb-pink` | `#F59AD9` | `#B03A92` |

### Contrast checks

| Text on surface | Light | Dark |
|---|---|---|
| Ink on canvas | 16.8:1 AAA | 18.3:1 AAA |
| Ink 2 on canvas | 13.1:1 AAA | 15.7:1 AAA |
| Muted on surface | 10.2:1 AAA | 11.2:1 AAA |
| Link on surface | 7.7:1 AAA | 10.0:1 AAA |
| Accent on surface | 7.2:1 AAA | 7.7:1 AAA |

The HTML manual calculates these live from the tokens.

---

## 3. Typography

| Role | Face | Size / line | Weight | Notes |
|---|---|---|---|---|
| Display | Segoe UI Variable Display, fallback Noto Sans | 40 / 44 | 700 | Letter-spacing −0.02em, covers only |
| Heading 1 | Same | 32 / 38 | 700 | Page titles |
| Heading 2 | Same | 24 / 30 | 700 | Section titles |
| Heading 3 | Same | 18 / 24 | 700 | Card titles |
| Body | Segoe UI Variable Text, fallback Noto Sans | 15 / 24 | 400 | Running text, about 65 characters wide |
| Secondary | Same | 13.5 / 20 | 400 | Hints in `--muted` |
| Number | Display face | 30 | 700 | `font-variant-numeric: tabular-nums` |
| Eyebrow / data | IBM Plex Mono | 12 | 500 | Uppercase, letter-spacing 0.1em |

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
```

Windows users see Segoe UI from their system. Everyone else gets Noto Sans.

---

## 4. Backgrounds (one per page, top band only)

| Name | Recipe | Best for |
|---|---|---|
| **Orb Field** (signature) | Three radial orbs (violet, cyan, peach) over a white-to-lavender wash | Dashboard top band |
| Aurora Mesh | Three soft radial washes, cyan top-left, pink top-right, violet bottom | Login and empty states |
| Spotlight | One violet radial from the top centre over the canvas | Reports, settings |
| Prism Haze | Conic sweep of all four orbs under a blurred canvas veil | Covers, onboarding |
| Dawn Wash | Linear white to lavender with a peach finish | Print covers, email headers |
| Grid and Orb | 22px line grid plus one violet orb | Technical pages, docs |
| Halo Rings | Repeating radial rings rising from the bottom centre | Section dividers |
| Ink Night | Fixed dark navy with violet and blue glows | Splash screens in either theme |

```css
.bg-orbs{
  background:
    radial-gradient(circle at 18% 70%, var(--orb-violet) 0, transparent 34%),
    radial-gradient(circle at 85% 15%, var(--orb-cyan) 0, transparent 30%),
    radial-gradient(circle at 62% 105%, var(--orb-peach) 0, transparent 24%),
    linear-gradient(165deg, var(--band-from), var(--band-to));
}
```

---

## 5. Glass effects

Always on an orb ground. Text on glass is full `--ink`.

| Name | Recipe | Use |
|---|---|---|
| Clear | 30% surface, blur 10px, white edge | Floating labels |
| **Frosted** (default) | `--glass`, sheen gradient, blur 22px, saturate 1.6, inner top highlight | KPI tiles, segmented control |
| Prism Edge | Glass fill with conic orb gradient border, violet glow | One hero element per screen |
| Violet Tint | 30% violet mixed into glass | Selected or featured tile |
| Cyan Tint | 30% cyan mixed into glass | Info panels |
| Smoked Ink | 62% ink, light text | Overlays on bright grounds |

```css
.glass{
  background: linear-gradient(140deg, var(--glass-sheen), transparent 45%), var(--glass);
  border: 1px solid var(--glass-edge);
  border-radius: var(--r-panel);
  -webkit-backdrop-filter: blur(22px) saturate(1.6);
  backdrop-filter: blur(22px) saturate(1.6);
  box-shadow: var(--shadow-lg), inset 0 1px 0 var(--glass-edge);
}
.glass-prism{
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--glass), var(--glass)) padding-box,
    conic-gradient(from 120deg, var(--orb-violet), var(--orb-cyan), var(--orb-peach), var(--orb-pink), var(--orb-violet)) border-box;
  backdrop-filter: blur(22px) saturate(1.8);
}
```

---

## 6. Patterns

All patterns use the single `--pat` token (light `rgba(75,63,209,.30)`, dark `rgba(167,157,255,.32)`).

| Name | CSS |
|---|---|
| Dot grid | `radial-gradient(var(--pat) 1.3px, transparent 1.6px) 0 0/16px 16px` |
| Line grid | Two 1px `linear-gradient`s at 0 and 90 degrees, 20px |
| Blueprint | Major 60px grid plus minor 12px grid at 45% strength |
| Diagonal | `repeating-linear-gradient(135deg, var(--pat) 0 1px, transparent 1px 10px)` |
| Cross-hatch | Diagonal at 45 and 135 degrees, 12px |
| Rings | `repeating-radial-gradient(circle at 0 100%, var(--pat) 0 1px, transparent 1px 14px)` |
| Chevron | Two 25% triangles at 135 and 225 degrees, 20px tile |
| Waves | SVG wave used as a CSS mask over `--pat`, 40 × 16px tile |

Use patterns for empty states, dividers and print covers. Keep text on a solid label above them.

---

## 7. Components

| Component | Spec |
|---|---|
| Primary button | Ink fill, canvas text, 1.5px ink border, 4px radius, 600 14px, padding 10 × 16 |
| Accent button | Accent fill, used once per view for the main action |
| Ghost button | Transparent, ink text and border, surface-2 on hover |
| Segmented control | Surface-2 or glass track, 8px radius; selected segment is ink fill, 5px radius |
| Input | Surface fill, 1.5px hairline border, 4px radius; focus is accent border plus 3px accent ring at 22% |
| Status chip | Tinted background with status text, 700 12px, 4px radius |
| Card | Surface, hairline border, 10px radius, low shadow, 20px padding |
| KPI tile | Frosted glass, label in ink 2, value 30px tabular, 6px progress bar in the category colour |
| Table | Surface-2 header in uppercase 12px ink 2, 1px hairline rows, tabular figures |

---

## 8. Shape, depth and spacing

- **Radius:** 4px for buttons, inputs and chips. 10px for cards. 14px for glass. Avatars only are round.
- **Shadow, low (cards):** `0 1px 2px rgba(11,20,36,.10), 0 2px 6px rgba(11,20,36,.08)`
- **Shadow, high (glass):** `0 10px 30px rgba(43,32,140,.16)`
- **Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 48px. Page gutter at least 16px.
- **Motion:** orbs drift slowly (20 to 24 seconds). All motion stops under `prefers-reduced-motion`.

---

## 9. Do and don't

**Do**

- Keep all text at ink, ink 2 or muted.
- Place glass only over an orb or aurora ground.
- Use one accent button per view.
- Pair every status colour with a word.
- Use tabular figures for counts, money and dates.
- Check every screen in both themes.

**Don't**

- Set text in light grey or orb colours.
- Round buttons into pills or use corners above 14px.
- Stack glass on glass, or put glass on a plain canvas.
- Use more than one background ground on a page.
- Use chart colours for buttons or links.

---

## 10. Token block (copy into any page)

```css
:root{
  --bg:#F5F4FA; --surface:#FFFFFF; --surface-2:#EFEDF7; --line:#D5D8E3;
  --ink:#0B1424; --ink-2:#1B2A44; --muted:#34415A;
  --accent:#4B3FD1; --accent-ink:#FFFFFF; --link:#0052A3;
  --good:#0A6B34; --warn:#8A4200; --bad:#A61D12;
  --good-bg:#E3F5EA; --warn-bg:#FFF0DD; --bad-bg:#FDE6E3;
  --c1:#4B3FD1; --c2:#0B74B8; --c3:#08806F; --c4:#B86A00; --c5:#B5287A; --c6:#4D5872;
  --orb-violet:#A493FF; --orb-cyan:#6FD3FF; --orb-peach:#FFBE98; --orb-pink:#F59AD9;
  --band-from:#FFFFFF; --band-to:#ECE8FF;
  --glass:rgba(255,255,255,.58); --glass-edge:rgba(255,255,255,.95); --glass-sheen:rgba(255,255,255,.75);
  --pat:rgba(75,63,209,.30);
  --shadow:0 1px 2px rgba(11,20,36,.10),0 2px 6px rgba(11,20,36,.08);
  --shadow-lg:0 10px 30px rgba(43,32,140,.16);
  --r-btn:4px; --r-card:10px; --r-panel:14px;
  --font:"Segoe UI Variable Text","Segoe UI","Noto Sans","Helvetica Neue",Arial,sans-serif;
  --font-display:"Segoe UI Variable Display","Segoe UI","Noto Sans","Helvetica Neue",Arial,sans-serif;
  --font-data:"IBM Plex Mono",ui-monospace,Consolas,monospace;
}
/* Dark values: use the same block under both selectors */
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){ /* dark tokens */ } }
:root[data-theme="dark"]{
  --bg:#070B16; --surface:#0F1626; --surface-2:#17213A; --line:#2B3756;
  --ink:#F5F7FC; --ink-2:#E0E6F2; --muted:#C3CCDD;
  --accent:#A79DFF; --accent-ink:#0B1424; --link:#8CC6FF;
  --good:#6BDCA2; --warn:#FFBE70; --bad:#FF9A8C;
  --good-bg:#0F3324; --warn-bg:#3A2610; --bad-bg:#3D1713;
  --c1:#A79DFF; --c2:#5CC3FF; --c3:#3FD6C0; --c4:#FFB547; --c5:#FF86C8; --c6:#AEB9D0;
  --orb-violet:#5B45E8; --orb-cyan:#0E86C2; --orb-peach:#C2643C; --orb-pink:#B03A92;
  --band-from:#0A1020; --band-to:#17123A;
  --glass:rgba(20,30,56,.50); --glass-edge:rgba(255,255,255,.22); --glass-sheen:rgba(255,255,255,.10);
  --pat:rgba(167,157,255,.32);
  --shadow:0 1px 2px rgba(0,0,0,.5),0 2px 8px rgba(0,0,0,.4);
  --shadow-lg:0 12px 34px rgba(0,0,0,.55);
  color-scheme:dark;
}
```
