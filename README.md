# Focus Gauge Plugin for Obsidian

A customizable Obsidian plugin that renders inline focus/activity gauges with visual progress indicators.

## Features

### 🎯 Inline Gauge Rendering
Convert text patterns like `[C 5]` into circular progress gauges that display activity levels (0-10).

### 🎨 Fully Customizable
- **Custom Types**: Define your own gauge types with custom labels, names, and colors
- **Flexible Syntax**: Configure the pattern syntax (default: `[TYPE VALUE]`)
  - Change brackets: `{C 5}`, `<C 5>`
  - Change separator: `[C:5]`, `[C-5]`
- **Color Picker**: Choose any color for each gauge type
- **Add/Remove Types**: Dynamically manage gauge types in settings

### ✏️ Smart Editing
- Gauges appear in both **Live Preview** (editing mode) and **Reading View**
- Hover cursor over a gauge to reveal the original text for easy editing
- Automatic conversion when cursor moves away

### 🎯 Optional Header Scoping
- Optionally limit gauge rendering to content under specific headers
- Example: Only show gauges under `## TimeBlocks` heading

### 📦 Build System
- Output to `build/` directory
- Automatic release version bumping with `npm run release`
- Copies `manifest.json` and `styles.css` automatically

## Installation

### From Release
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Copy them to `<vault>/.obsidian/plugins/focus-gauge-plugin/`
3. Reload Obsidian and enable the plugin in Settings → Community plugins

### Manual Build
1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Copy files from `build/` folder to your vault's plugin directory

## Usage

### Basic Syntax
With default settings, write:
```markdown
[C 5] Concentrated work session
[W 8] Deep work on project
[L 3] Learning new concept
[R 10] Rest and recovery
