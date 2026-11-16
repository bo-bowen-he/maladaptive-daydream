# Maladaptive Daydream

Dataset studies for Bo's Handmade Datasets Milestone 2 presentation.

- **pix2pix:** draw cloud contours and run the trained image-to-image model in the browser.
- **Cloud GAN:** explore an eight-anchor latent loop, random paths, and the original path.
- **Sleep / RAVE:** compare authentic renders from the 360k checkpoint, starting with a 0.3 Hz oscillator at 44.1 kHz.
- **Writing:** selected source excerpts and recorded default/poetry-only RAG comparisons.

The site is static HTML, CSS and JavaScript. `dist/` contains the deployable site.
The full writing corpus, raw sleep recordings, private redaction map, credentials,
and training checkpoints are not included.

## Preview locally

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765/. A local server is required for model and data loading.

## Vercel

Import this GitHub repository, use Framework Preset **Other**, no build command,
and Output Directory **dist**. The tracked `vercel.json` supplies these settings.
No environment variables or server functions are required. The image models
load on demand; RAVE plays recorded outputs rather than live inference.

## Attribution

Original creative content is shared under **CC BY 4.0**. A credit footnote is
sufficient when it includes the project, creator, source and license links, and
notes any changes. See [LICENSE.md](LICENSE.md) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
