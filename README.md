# Research website

Static site: `index.html`, `assets/style.css`, `assets/main.js`, figures in `assets/img/`.
No build step, no framework.

## Publish on GitHub Pages (free)

1. Create a public repository named `agiannoul.github.io`.
2. Upload everything in this folder (keep `.nojekyll`).
3. In the repository: Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. After a minute the site is live at https://agiannoul.github.io

## Editing

- Text and research items: `index.html` (one `<article class="work">` per paper).
- Publication list: the `P` array at the bottom of `assets/main.js`.
- Figure galleries (lightbox captions): the `G` object in `assets/main.js`.
- Replace a figure: overwrite the file in `assets/img/` with the same name.
