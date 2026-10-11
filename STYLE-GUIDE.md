# Shared portal styles

The static portal pages use the existing IBM Plex Sans Thai family and blue/gold palette. The tuition React app maintains its own stylesheet and tokens.

## Files and order

- `site-tokens.css`: shared colors, font family, and the existing elevation token.
- `site-chrome.css`: repeated top bar, header row, brand layout, and logo-image sizing.
- `navigation.css` / `navigation.js`: menu layout, focus treatment, keyboard navigation, and dismissal.
- Page styles and `personnel.css`: surface-specific layouts and variants.

Load tokens and header styles before local styles. Keep `navigation.css` in its current position relative to local rules: some pages intentionally override menu or header defaults. Paths on documents and insurance resolve through their existing `<base href="../">`.

## Tokens

| Token | Purpose | Value |
|---|---|---|
| `--navy` | Primary brand surfaces | `#082b5c` |
| `--blue` | Links and emphasis | `#0d4b97` |
| `--cyan` | Existing accent | `#39b7d8` |
| `--gold` | Existing brand accent and focus | `#f2c24f` |
| `--ink` | Main text | `#10223d` |
| `--muted` | Existing secondary text | `#5d6d84` |
| `--line` | Standard borders | `#dfe8f3` |
| `--paper` | Page background | `#f5f8fc` |
| `--white` | White surfaces/text | `#fff` |
| `--font-body` | Established font stack | IBM Plex Sans Thai, system-ui, sans-serif |
| `--shadow` | Existing broad panel elevation | `0 14px 40px rgba(8,43,92,.10)` |

Use `color:var(--ink)` and `background:var(--paper)` for those roles. Preserve intentional page-specific gradient stops, translucent colors, third-party document icons, and secondary document text colors. Do not map similar-looking colors to tokens if that changes the existing appearance. Token use does not guarantee contrast; check the actual foreground/background pairing when changing values.

The standard asset build copies these root CSS/JS files to the public output automatically:

```sh
node scripts/build-cloudflare-assets.mjs
```
