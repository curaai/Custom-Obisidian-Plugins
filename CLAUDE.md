# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Watch mode (dev build, outputs main.js)
npm run build        # Type-check + production build
npm run lint         # ESLint
```

**Testing**: Manual only. Copy `main.js` + `manifest.json` to:
```
C:\Users\admin\Documents\Personal\OneDrive\Apps\remotely-save\Obsidian\.obsidian\plugins\curaai-custom-focus-manager\
```
Then reload Obsidian and re-enable the plugin under **Settings → Community plugins**.

## Architecture

This is a single Obsidian plugin (`FocusGaugePlugin`) bundled into `main.js` via esbuild. Source lives in `src/`.

**`src/main.ts`** — Plugin entry point. Registers two commands, a `file-open` event, and a `window.focus` event. Also hosts the CodeMirror `ViewPlugin` (`FocusGaugeWidget` / `createFocusGaugePlugin`) for Live Preview rendering, plus a `MarkdownPostProcessor` for Reading View rendering.

**`src/settings.ts`** — `FocusGaugeSettings` interface, `DEFAULT_SETTINGS`, and `FocusGaugeSettingTab`. Settings include: `nowHeader` / `timeBlocksHeader` (the two managed sections), `gaugeTypes` (label/name/color tuples), syntax prefix/suffix/separator, `autoArchiveTimeBlocks`, and `autoCreateTimeBlock`.

**`src/timeBlockCollapse.ts`** — Core time-block archive logic:
- `archiveTimeBlocks`: the main exported function. Finds both sections, collects all `- <hour>` entries from them, then redistributes:
  - **Today's note**: prev/current/next hour → `nowHeader` section; everything else → `timeBlocksHeader` section. Creates the current-hour block if missing and `autoCreateTimeBlock` is on.
  - **Other day**: moves everything to `timeBlocksHeader` section (Now becomes empty except its pre-content).
- `findSectionBounds`: locates a section from its header to the next `##` or `---`.
- `parseSection`: splits section content into `preContent` (code blocks, non-time-block lines) and `TimeBlockEntry[]`. Skips lines inside fenced code blocks.
- `replaceSectionContent`: replaces the section's content lines in the editor. Handles both non-empty and empty (EOF) sections.
- Sections are replaced bottom-to-top so line numbers of the upper section stay valid.

## Key conventions

- Gauge renders without header restriction (everywhere in the file).
- Time block detection: `- <number>` where number is 0–23 and nothing else on the line (no children/suffix). Children of a block are indented lines that follow it.
- The `Now` section typically contains static pre-content (e.g., a dataviewjs block) before the time block entries — `parseSection` preserves this as `preContent`.
- `autoArchiveTimeout` (300 ms debounce) is used for both `file-open` and `window.focus` triggers to ensure the editor is fully rendered before archiving.
- Call `this.plugin.refreshExtension()` (which calls `app.workspace.updateOptions()`) after any setting change that affects the gauge regex or decoration colors.
- Default headers match the daily note template: `## 📊 Now` and `## 🕒 Time Blocks`.
