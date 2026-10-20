/**
 * Generates the Chrome Web Store and Firefox Add-ons screenshots in
 * `store/web-stores/screenshots/`: 1280×800, the size both stores recommend, and at
 * most 5, the Chrome Web Store's limit. Each scene captures the world map with the
 * built extension (see `screenshotCapture.ts`) in the browser-neutral window the README
 * images use, so one set serves both stores.
 *
 * Run with `bun run screenshots:web-stores`.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Page } from 'puppeteer';
import type { Settings } from '../src/shared/settings.ts';
import { fillTemplate } from './fillTemplate.ts';
import {
    capturePopup,
    captureShot,
    compose,
    dataUrl,
    DISPLAYED_HOST,
    repoRoot,
    withCaptureContext,
    WORLD_MAP,
    zoom,
} from './screenshotCapture.ts';
import { hudElement } from '../test/e2e/harness.ts';

/** The stores show screenshots at 1280×800 at most, so render at exactly that. */
const CANVAS = { width: 1280, height: 800, scale: 1 } as const;
/** The page area inside the drawn browser window: the map's 2:1 shape, filling it. */
const VIEWPORT = { width: 1120, height: 560 } as const;
/** The popup's height: it ends inside the window, just after the on-screen controls card. */
const POPUP_HEIGHT = 502;
/** Somewhere off the map's controls, so no button shows a hover state. */
const RESTING_POINTER = { x: 300, y: 420 } as const;

const outputDir = new URL('store/web-stores/screenshots/', repoRoot);

interface Scene {
    fileName: string;
    title: string;
    subtitle: string;
    settings?: Partial<Settings>;
    /** Drives the page into the state to capture. */
    act: (page: Page) => Promise<void>;
    /** Shows the options popup over the page. */
    withPopup?: boolean;
}

/** Clicks a HUD button, then moves the pointer away so it doesn't show as hovered. */
async function clickHud(page: Page, selector: string, times = 1): Promise<void> {
    const button = await hudElement(page, selector);
    for (let click = 0; click < times; click++) {
        await button.click();
    }
    await page.mouse.move(RESTING_POINTER.x, RESTING_POINTER.y);
}

const SCENES: Scene[] = [
    {
        fileName: '01-infinite-zoom.png',
        title: 'Infinite zoom for any SVG',
        subtitle: 'Scroll to zoom in at the pointer and drag to pan. Vector graphics stay sharp at every level.',
        act: async (page) => {
            await zoom(page, { x: 624, y: 174 }, 3);
        },
    },
    {
        fileName: '02-zoom-box.png',
        title: 'Drag a box to zoom right to it',
        subtitle: 'Switch click-and-drag from panning to a zoom box in the settings.',
        settings: { clickAndDragBehavior: 'zoomBox' },
        act: async (page) => {
            // Captured mid-drag, so the zoom box is still on screen.
            await page.mouse.move(570, 110);
            await page.mouse.down();
            await page.mouse.move(720, 215, { steps: 10 });
        },
    },
    {
        fileName: '03-dark-mode.png',
        title: 'Easy on the eyes at night',
        subtitle: 'The background button inverts the drawing: dark lines turn light, and colors keep their hue.',
        act: async (page) => {
            await zoom(page, { x: 860, y: 170 }, 3);
            // Checkerboard, then a dark background, then the inverted drawing.
            await clickHud(page, '.background', 3);
        },
    },
    {
        fileName: '04-export.png',
        title: 'Export exactly what you see',
        subtitle: 'Save the view as a PNG at up to 4×, get the SVG as authored, or copy a link to this view.',
        act: async (page) => {
            await zoom(page, { x: 820, y: 230 }, 3);
            await clickHud(page, '.export');
        },
    },
    {
        fileName: '05-settings.png',
        title: 'Make it work your way',
        subtitle: 'Choose the drag behavior, scroll speed, on-screen controls, minimap, and background.',
        act: async (page) => {
            await zoom(page, { x: 400, y: 300 }, 2);
        },
        withPopup: true,
    },
];

async function main(): Promise<void> {
    await withCaptureContext(async (context) => {
        const frame = await readFile(new URL('scripts/neutralFrame.html', repoRoot), 'utf8');
        const toolbarIcon = dataUrl(await readFile(new URL('src/icon_38.png', repoRoot)));
        await rm(outputDir, { recursive: true, force: true });
        await mkdir(outputDir, { recursive: true });
        for (const scene of SCENES) {
            const page = dataUrl(await captureShot(context, {
                svg: WORLD_MAP,
                viewport: VIEWPORT,
                scale: CANVAS.scale,
                settings: scene.settings,
                act: scene.act,
            }));
            const maybePopup = scene.withPopup ? dataUrl(await capturePopup(context, CANVAS.scale, POPUP_HEIGHT)) : undefined;
            const html = fillTemplate(frame, {
                canvasWidth: String(CANVAS.width),
                canvasHeight: String(CANVAS.height),
                viewportWidth: String(VIEWPORT.width),
                viewportHeight: String(VIEWPORT.height),
                title: scene.title,
                subtitle: scene.subtitle,
                displayedHost: DISPLAYED_HOST,
                toolbarIcon,
                page,
                // The frame hides its popover when this is empty.
                popup: maybePopup ?? '',
            });
            await writeFile(new URL(scene.fileName, outputDir), await compose(context.browser, html, CANVAS, CANVAS.scale));
            console.log(`Wrote store/web-stores/screenshots/${scene.fileName}`);
        }
    });
}

await main();
