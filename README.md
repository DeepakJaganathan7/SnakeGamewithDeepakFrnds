# Friendsy Snake (PWA)
An original, cozy sitcom‑café styled Snake game. No copyrighted music or images are included; background music is generated live with WebAudio.

## Features
- Obstacles, power‑ups (Coffee 2× points, Boots speed boost, Umbrella one‑time shield)
- Local high score, levels and increasing speed
- On‑screen mobile controls
- Background music toggle
- Offline‑first PWA (manifest + service worker + icons)

## Run locally
Just serve the folder with any static server, e.g.:
```bash
# Python 3
python -m http.server 8080
# or Node
npx serve .
```
Open http://localhost:8080 and enjoy. On mobile, add to Home Screen to install.

## Deploy
Upload the folder to any static host (GitHub Pages, Netlify, Vercel). PWA will work over HTTPS.
