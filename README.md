# PNG to ICO Converter

Convert PNG images into multi-resolution Windows `.ico` files — entirely in your
browser. No uploads, no server-side processing.

**Live site:** https://woteq-tools.github.io/convert-png-to-ico/

## What it does

- Accepts any PNG (up to 10 MB).
- Decodes it with [pngjs](https://github.com/lukeapage/pngjs), the same pure-JS
  decoder the upstream Node tool uses.
- Resamples to each selected size using the exact algorithms from
  [png-to-ico](https://github.com/steambap/png-to-ico).
- Writes a standard Windows `.ico` container with a 32-bit alpha channel per
  size.
- Previews every embedded resolution before you download.

Default sizes are 16, 32, 48 and 256 px. You can select 16, 24, 32, 48, 64, 128
and/or 256 px.

## Byte-for-byte identical to the original tool

The conversion is not a re-implementation — it is a port of the upstream
algorithm, verified to produce **byte-identical** `.ico` files to the Node CLI:

```bash
npx png-to-ico input.png > expected.ico
```

The browser build produces the same bytes for the same input. Verification
covers multiple image sizes, colour types (RGB, grayscale, palette) and all
five resampling methods (nearest neighbour, bilinear, bicubic, hermite, bezier).

## Project layout

```
index.html                    the page
assets/css/style.css          styles
assets/js/app.js              UI logic (file handling, conversion, preview)
assets/js/png-to-ico.js       browser port of the png-to-ico library
assets/js/pngjs-browser.js    browser entry point for the pngjs decoder
assets/js/pngjs.browser.min.js bundled pngjs decoder (built with esbuild)
favicon.png                   site icon
```

## Building the pngjs bundle

`assets/js/pngjs.browser.min.js` is generated from `pngjs` plus small browser
shims for Node's `zlib`, `util` and `assert` (fflate provides the inflate):

```bash
npm install pngjs fflate esbuild buffer
node build-pngjs.mjs
```

## Credits & licence

- Conversion library: [steambap/png-to-ico](https://github.com/steambap/png-to-ico)
  by Weilin Shi — MIT. Ported to the browser in `assets/js/png-to-ico.js`.
- PNG decoder: [lukeapage/pngjs](https://github.com/lukeapage/pngjs) — MIT.
- Resampling code derived from `node-canvas` by Guyon Roche — MIT.

See [LICENSE](LICENSE).
