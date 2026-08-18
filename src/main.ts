import { Editor, Notice, Plugin } from "obsidian";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import {
	FocusGaugeSettings,
	DEFAULT_SETTINGS,
	FocusGaugeSettingTab,
} from "./settings";
import { archiveTimeBlocks } from "./timeBlockCollapse";

class FocusGaugeWidget extends WidgetType {
	constructor(private type: string, private value: number, private color: string) {
		super();
	}

	toDOM() {
		const span = document.createElement("span");
		span.className = `focus-gauge focus-${this.type}`;
		span.style.setProperty("--value", this.value.toString());
		span.style.setProperty("--color", this.color);
		return span;
	}
}

function createFocusGaugePlugin(settings: FocusGaugeSettings) {
	const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const typeLabels = settings.gaugeTypes.map(t => t.label).join('');
	const prefix = escapeRegex(settings.syntaxPrefix);
	const suffix = escapeRegex(settings.syntaxSuffix);
	const separator = escapeRegex(settings.syntaxSeparator);
	const regex = new RegExp(`${prefix}([${typeLabels}])${separator}(\\d{1,2})${suffix}`, 'gi');

	const typeColorMap = new Map(
		settings.gaugeTypes.flatMap(t => [
			[t.label.toUpperCase(), t.color],
			[t.label.toLowerCase(), t.color]
		])
	);

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const cursorPos = view.state.selection.main.head;

				for (const { from, to } of view.visibleRanges) {
					const text = view.state.doc.sliceString(from, to);
					let match;

					regex.lastIndex = 0;

					while ((match = regex.exec(text)) !== null) {
						const matchStart = from + match.index;
						const matchEnd = matchStart + match[0].length;

						if (cursorPos >= matchStart && cursorPos <= matchEnd) {
							continue;
						}

						const type = match[1]!;
						const value = Math.min(Math.max(parseInt(match[2]!), 0), 10);
						const color = typeColorMap.get(type) || '#888888';

						builder.add(
							matchStart,
							matchEnd,
							Decoration.replace({
								widget: new FocusGaugeWidget(type, value, color),
							})
						);
					}
				}

				return builder.finish();
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}

export default class FocusGaugePlugin extends Plugin {
	settings: FocusGaugeSettings;
	private autoArchiveTimeout: ReturnType<typeof setTimeout> | null = null;
	private findCharHandler: ((evt: KeyboardEvent) => void) | null = null;

	async onload() {
		await this.loadSettings();
		this.setupExtensions();

		this.addSettingTab(new FocusGaugeSettingTab(this.app, this));

		this.addCommand({
			id: 'archive-time-blocks',
			name: '시간 블록 정리 (Now / Time Blocks 분류)',
			callback: () => {
				void archiveTimeBlocks(this.app, this.settings);
			}
		});

		this.addCommand({
			id: 'move-cursor-to-char',
			name: '현재 줄에서 지정한 문자로 커서 이동',
			editorCallback: (editor) => {
				this.moveCursorToNavChar(editor);
			}
		});

		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (this.settings.autoArchiveTimeBlocks && file) {
					if (this.autoArchiveTimeout) {
						clearTimeout(this.autoArchiveTimeout);
					}
					this.autoArchiveTimeout = setTimeout(() => {
						void archiveTimeBlocks(this.app, this.settings, true);
					}, 300);
				}
			})
		);

		this.registerDomEvent(window, 'focus', () => {
			if (this.settings.autoArchiveTimeBlocks) {
				if (this.autoArchiveTimeout) {
					clearTimeout(this.autoArchiveTimeout);
				}
				this.autoArchiveTimeout = setTimeout(() => {
					void archiveTimeBlocks(this.app, this.settings, true);
				}, 300);
			}
		});
	}

	moveCursorToNavChar(editor: Editor) {
		const target = this.settings.lineNavChar;
		if (!target) {
			this.awaitFindChar(editor);
			return;
		}

		this.moveCursorToCharOnLine(editor, target);
	}

	private moveCursorToCharOnLine(editor: Editor, char: string) {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const index = line.indexOf(char);
		if (index !== -1) {
			editor.setCursor({ line: cursor.line, ch: index });
		}
	}

	/**
	 * vim의 `f{char}` 모션처럼, 다음에 입력되는 한 글자를 기다렸다가
	 * 현재 줄에서 그 글자가 처음 나오는 위치로 커서를 이동시킨다.
	 */
	awaitFindChar(editor: Editor) {
		if (this.findCharHandler) {
			window.removeEventListener('keydown', this.findCharHandler, true);
			this.findCharHandler = null;
		}

		const notice = new Notice('문자 입력 대기 중… (Esc로 취소)', 3000);

		const handler = (evt: KeyboardEvent) => {
			// 순수 modifier 키 입력은 무시하고 계속 대기한다.
			if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph'].includes(evt.key)) {
				return;
			}

			window.removeEventListener('keydown', handler, true);
			this.findCharHandler = null;
			notice.hide();

			if (evt.key === 'Escape') {
				return;
			}

			if (evt.ctrlKey || evt.altKey || evt.metaKey || evt.key.length !== 1) {
				return;
			}

			evt.preventDefault();
			evt.stopPropagation();

			this.moveCursorToCharOnLine(editor, evt.key);
		};

		this.findCharHandler = handler;
		window.addEventListener('keydown', handler, true);
	}

	onunload() {
		if (this.findCharHandler) {
			window.removeEventListener('keydown', this.findCharHandler, true);
			this.findCharHandler = null;
		}
	}

	setupExtensions() {
		this.registerEditorExtension(createFocusGaugePlugin(this.settings));

		this.registerMarkdownPostProcessor((element) => {
			const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			const typeLabels = this.settings.gaugeTypes.map(t => t.label).join('');
			const prefix = escapeRegex(this.settings.syntaxPrefix);
			const suffix = escapeRegex(this.settings.syntaxSuffix);
			const separator = escapeRegex(this.settings.syntaxSeparator);
			const regex = new RegExp(`${prefix}([${typeLabels}])${separator}(\\d{1,2})${suffix}`, 'gi');
			const typeColorMap = new Map(
				this.settings.gaugeTypes.flatMap(t => [
					[t.label.toUpperCase(), t.color],
					[t.label.toLowerCase(), t.color]
				])
			);

			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
				null
			);

			const nodes: Text[] = [];
			let node = walker.nextNode();
			while (node) {
				nodes.push(node as Text);
				node = walker.nextNode();
			}

			for (const textNode of nodes) {
				const text = textNode.nodeValue ?? "";
				regex.lastIndex = 0;
				if (!regex.test(text)) {
					continue;
				}

				regex.lastIndex = 0;
				const fragment = document.createDocumentFragment();
				let lastIndex = 0;
				let match: RegExpExecArray | null;
				while ((match = regex.exec(text)) !== null) {
					if (match.index > lastIndex) {
						fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
					}

					const type = String(match[1] ?? "");
					const rawValue = String(match[2] ?? "0");
					const value = Math.min(Math.max(parseInt(rawValue, 10), 0), 10);
					const color = typeColorMap.get(type) || "#888888";
					const gauge = document.createElement("span");
					gauge.className = `focus-gauge focus-${type}`;
					gauge.style.setProperty("--value", String(value));
					gauge.style.setProperty("--color", color);
					fragment.appendChild(gauge);
					lastIndex = match.index + match[0].length;
				}

				if (lastIndex < text.length) {
					fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
				}

				textNode.replaceWith(fragment);
			}
		});
	}

	refreshExtension() {
		this.app.workspace.updateOptions();
	}

	async loadSettings() {
		const saved = (await this.loadData()) as Partial<FocusGaugeSettings> | undefined;
		this.settings = { ...DEFAULT_SETTINGS, ...saved };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
