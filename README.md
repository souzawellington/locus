![Locus](.github/assets/banner.svg)

A local vault for linked notes. The text stays in the browser.

[![Live demo](https://img.shields.io/badge/Live_demo-open-9C4520?style=flat-square)](https://locus-brown-delta.vercel.app)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-1A1714?style=flat-square&logo=vercel&logoColor=F3EFE6)](https://locus-brown-delta.vercel.app)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-1A1714?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-9C4520?style=flat-square)](https://react.dev/)
[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1-6D655C?style=flat-square)](https://tanstack.com/start)
[![Vite](https://img.shields.io/badge/Vite-8-F3EFE6?style=flat-square&labelColor=1A1714)](https://vite.dev/)

## Overview

Locus is a writing desk for one device. You write a note, type `/` for a block and `@` for another note, and the same notes can sit on a canvas, feed a small reactive notebook, or answer a question in Atlas with the passage they came from.

There is no account. The vault is stored in the browser. Export is a markdown file you download on purpose.

The interface is in Portuguese.

## Em português

Locus é um cofre de notas que mora no navegador. Você escreve como num bloco de notas: `/` abre o menu de blocos e `@` liga outra nota pelo nome. As mesmas notas vão para o canvas, para um caderno que executa pela dependência e para o Atlas. A resposta aponta o trecho de onde veio. Sem conta e sem nuvem: o texto fica neste dispositivo, e exportar é um arquivo que você baixa de propósito.

## Features

- **Notes.** The visual editor is the default. Type `/` for a block (figure, sticker, photo, camera, video, note link, heading, list, checklist, quote, divider, code) or tap **+**. Type `@` to link a note by name. A reading view sits beside the note.
- **Photos and video.** Gallery, in-app camera, a short clip, drag-and-drop and paste. Images are resized on the device and kept in IndexedDB. Nothing is uploaded.
- **Private notes.** **Trancar nota** encrypts the note on the device (PBKDF2 and AES-GCM). The list shows a padlock and the title, or hides the title. A forgotten password cannot be recovered. Unlock lasts for the session, then locks again after inactivity, or with **Trancar agora**.
- **Canvas.** Each card is a whole note. Moving it does not copy the text. Lines follow the links between notes. A locked note does not preview its text.
- **Notebook.** A small interpreter (`mean`, `std`, `chart`, and the rest) runs cells by dependency, not by screen order.
- **Graph.** Note links drawn as a graph. Drag a node to pin it.
- **Atlas.** Local retrieval over the vault (n-gram vectors and BM25) with citations. Pattern tools such as `extract_wisdom` preview a note and write only after you approve. Locked notes stay out of search until they are open.
- **On this device.** Search, theme, focus mode, and the command palette (`Ctrl+K` or `⌘K`). New note is `Ctrl+N`. **Ajustes** holds **Ver código** for the file view, off by default, and an optional device PIN.
- **Figures.** A note can hold an interactive instrument. Insert it from `/` or **+**, as a full figure or a sticker.

![The block menu](docs/assets/slash-menu.png)

![A figure and its toolbar](docs/assets/figure-toolbar.png)

![A note linked by name](docs/assets/note-chip.png)

![A locked note](docs/assets/lock-screen.png)

![A recipe with a photo](docs/assets/recipe-photo.png)

![The block menu on a phone](docs/assets/slash-menu-mobile.png)

## Figures

A figure is a small machine whose working is the idea: a patch bay for linked notes, a composing stick for a merge, a press that waits for approval. Hover or the arrow keys move it. Tap the figure for a small toolbar: full size or sticker, animation on or off, a rotation slider, take apart, export, remove. An unknown figure stays in the note and says so. Nothing is fetched.

Insert one with `/` or **+**, or from the command palette. The sample note **Figuras do cofre** holds the pack. **Edição em blocos** carries a sticker. **Bolo de laranja** is the photo example.

The drawings are [Anatomy](https://github.com/wheresryan22/anatomy) figures (MIT, Ryan), vendored at `.agents/skills/anatomy` with that license. This pack is SVG only, in the light Locus palette. WebGL and the 3D turn mode are not used. Generated example HTML and PDFs are left out; `node examples/<name>/build.mjs` in that folder rebuilds them.

| Slug | Machine |
| --- | --- |
| `wikilinks` | Patch bay. One cord, two lamps. |
| `crdt` | Composing stick. Two slugs, no referee. |
| `embeddings` | Comparator. The score stays on the bench. |
| `notebook` | Balance train. Order follows dependency. |
| `atlas` | Fiche reader. The finger lands on a real line. |
| `canvas` | Drafting board. A card moves, the sheet does not copy. |
| `approval` | Press. The platen waits for the lever. |
| `local-vault` | Desk safe. Export is the slip drawer. |

![A figure inside a note](docs/assets/figures.png)

### Stickers

**Figurinhas**, in the header, is a drawer of the same machines. Each one has a white edge, a soft shadow, and a small tilt. **Na nota** drops it into the open note. **No canvas** puts it on the board as its own piece: the canvas still draws note cards, and a sticker sits beside them so you can drag it. It is not a second copy of a note.

From the toolbar, a sticker can loop or hold still, and the rotation slider turns it a little, from -12 to 12 degrees. A full figure is the instrument; a sticker is the small card. Notes saved before this editor still open as the same cards.

Export stays on this device. From the note or the drawer: SVG, a transparent PNG at 512 and at 1024, and an animated SVG. The animation is the same `place` loop, written as SVG motion, so it needs no GIF or WebP encoder and stays sharp. `prefers-reduced-motion` freezes the live loop.

![The Figurinhas drawer](docs/assets/stickers-drawer.png)

![An animated composing-stick sticker](docs/assets/stickers.gif)

![A sticker dropped on the canvas](docs/assets/stickers-canvas.png)

### Propose an idea

**Proponha uma ideia**, in the figure picker, the Figurinhas drawer, and the command palette, asks for a machine in plain words. The model must answer with the same part list the other figures use: slabs, cylinders, screws, a moving layer, and a lift for taking it apart. The app checks that shape, refuses scripts, event handlers, external links and `foreignObject`, and only then draws it. A bad answer stays unsaved, with a retry.

The feature does nothing until you paste your own key. The key lives in this browser’s `localStorage`, labelled in the settings panel, and it is sent only to the provider you pick: xAI, OpenAI, or another HTTPS endpoint that speaks the OpenAI chat-completions format. There is a button to remove it. No key is shipped with Locus. Anthropic is not offered: its API is not a browser call of that shape. Nothing on the network runs until you press **Gerar**.

A saved figure is named from what you asked. It can sit in a note, the drawer, or the canvas, full size or as a sticker, still or animated. **Minhas figuras** renames or deletes it. Deleting it leaves the card, which then reads as an unknown figure.

![The key stays on this device](docs/assets/idea-settings.png)

![A generated figure, ready to save](docs/assets/idea-flow.png)

![The saved figure inside a note](docs/assets/idea-note.png)

## Interface

Captured from the running app. The window frame is only for this page.

![Notes](docs/assets/notes.png)

![Canvas](docs/assets/canvas.png)

![Notebook](docs/assets/notebook.png)

![Graph](docs/assets/graph.png)

![Atlas](docs/assets/atlas.png)

## Palette

Taken from the app theme in `src/styles.css`.

![Palette](.github/assets/palette.svg)

| Name | Hex | Role |
| --- | --- | --- |
| Paper | `#F3EFE6` | Page |
| Warm | `#FAF7F1` | Raised surface |
| Line | `#E2D9C9` | Hairline |
| Muted | `#6D655C` | Secondary text |
| Ink | `#1A1714` | Text |
| Copper | `#9C4520` | Accent |

Dark theme swaps the same roles: paper `#12100E`, ink `#F3EEE6`, copper `#E39462`.

The mark is the ring and copper point from `public/favicon.svg`.

![Locus wordmark](.github/assets/wordmark.svg)

## Stack

React 19, TanStack Start and Router, Vite, Tailwind CSS 4, Radix, Zustand. The vault itself is client state persisted to `localStorage`.

Postgres is optional and unused by the notes. With `DATABASE_URL`, server code uses `pg`. Without it, an in-memory PGLite database can apply `migrations/*.sql`. The Better Auth schema lives in `migrations/auth/` and is not applied to the note vault. Sign-in is off (`config/app-env.json` sets `VITE_AUTH_ENABLED` to `false`).

Atlas can call the xAI API when `XAI_API_KEY` is set. Without that key, pattern extraction stays on the local path.

## Getting started

The live app is at [locus-brown-delta.vercel.app](https://locus-brown-delta.vercel.app). Every push to `main` redeploys it.

To run a copy locally, Node.js 22.

```bash
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080). The sample vault is already there.

```bash
cp .env.example .env   # optional
npm test
npm run typecheck
npm run build
```

| Script | What it does |
| --- | --- |
| `dev` | Vite on `0.0.0.0:8080`, with `config/app-env.json` applied |
| `build` | Production build, then `db:migrate` |
| `db:migrate` | Applies `migrations/*.sql` when `DATABASE_URL` is set. Skips otherwise |
| `preview` | Serves the production build |
| `test` | Migration, auth-flag, and library tests |
| `typecheck` | `tsc --noEmit` |
| `lint` / `format` | ESLint and Prettier |

`scripts/grok-pwa-plugin.test.mjs` is the platform install-page suite. It assumes a blank template title, so it is not part of `npm test` once the app is named Locus and ships `public/og.jpg`.

## Project structure

```
src/components/locus/   notes, visual editor, canvas, notebook, graph, atlas
src/lib/vault/          store, markdown, seal, notebook, retrieval, patterns
src/lib/media/          photos and video in IndexedDB, encrypted with a locked note
src/lib/auth/           optional Better Auth, off unless you turn it on
src/lib/db.ts           PGLite fallback or Postgres via DATABASE_URL
src/routes/             TanStack Start routes
migrations/auth/        Better Auth tables, opt-in
config/app-env.json     build flag: auth disabled
public/                 favicon and share card
.github/assets/         mark, wordmark, banner, palette
```

## Roadmap

The sample notes talk about CRDT sync, WebGPU embeddings, and a larger notebook runtime. Those are essays in the vault, not the engine that stores it. Today the copy that matters is `localStorage` on this browser.

What the app already draws a line toward:

- Sync between devices without giving up the local copy
- Embeddings that stay on the device
- A license, when the author chooses one

## Author

[Wellington Vieira De Souza](https://github.com/souzawellington)

## License

This repository does not include a license. All rights stay with the author until one is added.
