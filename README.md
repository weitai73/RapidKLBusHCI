# RapidKLBusHCI
HCI Assignment

## KLCC day and night appearance

Open `index.html`, or serve this directory with `python -m http.server 8080 --bind 127.0.0.1`.

- The header's **Day / Night** switch changes both the KLCC background and the complete dashboard theme.
- Day mode features the supplied KLCC photograph, drifting clouds, sunlight and water shimmer.
- Night mode uses the separately supplied nighttime KLCC photograph, with a gentle camera drift and atmospheric effects.
- Day and night photographs and their contrast overlays crossfade over 1.6 seconds, including when a transition is reversed midway.
- The floating location cards have been removed from both modes. **Pause background animation** is available at the foot of the page. Device reduced-motion preferences disable animation and transitions automatically; hidden tabs also stop animating.
- Appearance and motion preferences are stored separately from operational demo records. Controls continue to work if browser storage is blocked.

`atmosphere.css` contains the layered scene and theme surfaces. `theme.js` applies the saved or system theme before paint and connects the accessible switches. The original route data and operational workflows remain in `script.js`.

### Images

`assets/klcc.png` is the original daytime KLCC photograph. `assets/klcc-night.png` is the separately supplied nighttime photograph. Both are preloaded for smooth switching. Atmospheric motion is rendered in the browser.

The bus photograph used in the header is by [CEphoto, Uwe Aranas](https://commons.wikimedia.org/wiki/File:Kuala_Lumpur_Malaysia_rapidKL-bus-01.jpg), licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). It is displayed cropped. Attribution is also available through **About this prototype**.

This is an independent student HCI prototype using simulated operational data.
