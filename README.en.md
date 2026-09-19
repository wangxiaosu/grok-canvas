# Grok Canvas

[简体中文](README.md) | **English**

**Bring Grok image and video generation onto an infinite canvas.**

Sign in with your own Grok account, connect reference images, generate variations, and turn images into videos. Keep your assets and different versions on one canvas as you explore new directions.

I have always wanted to build my own infinite canvas. Grok's image and video generation gave me a practical way to bring that idea to life, and to help existing Grok subscribers put their available usage allowance to work.

> An independent, unofficial project, not affiliated with xAI or Grok. This early version runs locally on your computer for personal use. The author has generated images and videos using a Grok subscription; individual plans have not all been verified.

## Features

- **Generate and iterate on images**: text-to-image, multiple reference images, `@` references in prompts, and batches of 1, 2, or 4 candidates.
- **Continue from images to video**: text-to-video, first and last frames, reference images, 6 / 10 / 15-second durations, and an audio toggle.
- **Keep the creative process on the canvas**: pan, zoom, connect nodes, and manage multiple canvases. Generating a variation creates a new node while keeping the original image.
- **Save results locally**: assets, canvases, and generation records are stored on your computer. Inspect generation parameters and download results. Video tasks persist their status so polling can resume.

## Accounts and usage

Sign in through xAI OAuth; no API key is required in the project. The current integration uses the Grok Build OAuth client, so **the authorization page displays Grok Build**. This is not a separate official OAuth client for Grok Canvas. Long-term availability and permission to distribute this third-party integration have not been separately confirmed; it is provided as an experimental integration.

Generation uses the allowance available to your own Grok account. The author has verified image and video generation with a Grok subscription. Available features and usage limits depend on your account; see the [official Grok documentation](https://docs.x.ai/grok/faq).

## Quick start

You need **Git, Node.js 22.18+, and pnpm 10.33.2**. The repository's `.nvmrc` pins the verified Node.js version, 22.22.2. If you use nvm, run `nvm install` and `nvm use` from the repository directory.

Install pnpm if needed:

```sh
npm install -g pnpm@10.33.2
```

Clone, install, and start:

```sh
git clone https://github.com/wangxiaosu/grok-canvas.git
cd grok-canvas
pnpm install --frozen-lockfile
pnpm dev
```

Open **[http://127.0.0.1:3210](http://127.0.0.1:3210)** in a desktop browser. No `.env` configuration is needed by default.

1. Click the sign-in button in the top-right corner and authorize your own account on the xAI authorization page.
2. Return to the canvas and confirm that you are signed in. If the automatic callback does not complete, paste the authorization code into the sign-in popover. Start again if the sign-in attempt exceeds 10 minutes.
3. Add an image node, enter a prompt, and generate your first image.
4. Connect an image to another image or video node to use it as an input. For video, assign images as the first frame, last frame, or references.
5. Download the results you like. Canvases save automatically and are available when you restart with the same local data.

Press `Ctrl+C` in the terminal to stop the server. For regular use, you can also build and start a production server:

```sh
pnpm build
pnpm start
```

Both `dev` and `start` use local port 3210; run only one at a time. Do not build in the same directory while the development server is running. Use a separate working directory to verify a production build if needed.

## Limitations and troubleshooting

| Situation | Details |
| --- | --- |
| Editing on a phone | The canvas is desktop-only. Minimum window size: 1100 × 640; recommended: 1440 × 900. |
| Signed in but cannot generate | Signing in does not guarantee model access. Check account usage, plan permissions, and the error message. Sign in again if authentication has expired. |
| Quota or rate-limit errors | Check your Grok account page and wait for limits to reset or follow the official guidance. Retrying generation may consume additional usage. |
| Checking remaining usage | The app does not currently show remaining allowance or cost estimates. Check the usage page in your Grok account. |
| Port in use / HTTP 403 | Use `127.0.0.1:3210` or `localhost:3210`. Access checks and OAuth callbacks currently require this port; arbitrary ports and domains are not supported. |
| Image upload fails | PNG / JPEG / WebP, up to 20 MB per image. Image generation accepts up to 5 reference images. |
| 1080p video is unavailable | Videos with a last frame or reference images are limited to 720p. With only a first frame, the aspect ratio follows that frame. Up to 7 video reference images are supported. |
| Video finishes but download fails | The task record is retained so saving can be retried. If the upstream temporary link has expired, a new generation is needed. |
| Closing the page or server | Saved canvases and assets remain. Persisted video tasks can resume polling. Keep the page and local server open during image generation. |
| Deploying to a server | This is a single-user local service without multi-user isolation. Public hosting or exposing it to others through a tunnel is not supported. |

The current application interface is in Chinese; this English README does not change the interface language.

## Data and privacy

Default storage locations (`~` is your home directory):

```text
~/.grok-canvas/
  auth.json              # OAuth credentials
  data/
    app-state.json       # Most recently used canvas
    canvases/            # Canvases, nodes, and edges
    assets/              # Uploaded and generated images and videos
    generations/         # Generation records associated with assets
    video-tasks/         # Video requests and task status
```

Generation records store the original and submitted prompts, model, parameters, and reference order. Later canvas edits do not overwrite them. Uploaded assets and older assets without records are not assigned invented generation histories. Deleting a canvas does not delete its asset files.

Your local server sends prompts and the reference images used for generation to xAI, then downloads results to your computer. Local storage does not mean offline generation.

To back up your work, stop the server and copy the entire `data` directory. `auth.json` contains sensitive credentials: do not upload it to GitHub, attach it to an issue, or share it with your artwork. Signing out clears this project's local credentials; it does not revoke account-side authorization or delete your work.

To customize storage paths, copy [`.env.example`](.env.example) to `.env.local`, set absolute paths as described in the comments, and restart. Existing data is not automatically moved to the new paths.

## Development and feedback

Built with Next.js, React, TypeScript, React Flow, and Tailwind CSS.

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm check` runs these checks in order. Automated tests use mocked requests and do not require sign-in or consume Grok usage. Contributions through issues and pull requests are welcome.

Tell us about your first experience in [Issues](https://github.com/wangxiaosu/grok-canvas/issues): did installation work, could you generate images and videos, and where did you get stuck? Include your operating system, Node.js version, reproduction steps, and sanitized errors. Never share credentials. For security issues, ask the maintainer for a private reporting channel before sharing vulnerability details.

## License

[MIT](LICENSE) © 2026 KyroWang. Third-party dependencies retain their own licenses. This license does not grant access to xAI services or replace their service rules.
