import { Plugin, MarkdownView, editorViewField } from "obsidian";
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

// Live Preview용 위젯
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

// 헤더 체크를 위한 헬퍼 함수
function isUnderEnabledHeader(
	view: EditorView,
	lineNumber: number,
	enabledHeader: string
): boolean {
	if (!enabledHeader) return true;

	// 현재 라인보다 위로 올라가면서 헤더 찾기
	for (let i = lineNumber; i >= 1; i--) {
		const line = view.state.doc.line(i);
		const lineText = line.text.trim();

		// 설정된 헤더를 찾으면 true
		if (lineText === enabledHeader) {
			return true;
		}

		// 다른 헤더를 먼저 만나면 false (더 상위 섹션)
		if (lineText.startsWith("#") && lineText !== enabledHeader) {
			// 같은 레벨 또는 상위 레벨 헤더인지 확인
			const enabledLevel = enabledHeader.match(/^#+/)?.[0].length || 0;
			const currentLevel = lineText.match(/^#+/)?.[0].length || 0;
			if (currentLevel <= enabledLevel) {
				return false;
			}
		}
	}

	return false;
}

// Live Preview용 ViewPlugin (설정 주입 필요)
function createFocusGaugePlugin(settings: FocusGaugeSettings) {
	// 특수 문자 이스케이프 함수
	const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	// 설정에서 타입 레이블 추출하여 동적 정규표현식 생성
	const typeLabels = settings.gaugeTypes.map(t => t.label).join('');
	const prefix = escapeRegex(settings.syntaxPrefix);
	const suffix = escapeRegex(settings.syntaxSuffix);
	const separator = escapeRegex(settings.syntaxSeparator);
	const regex = new RegExp(`${prefix}([${typeLabels}])${separator}(\\d{1,2})${suffix}`, 'g');

	// 타입-색상 매핑 생성
	const typeColorMap = new Map(
		settings.gaugeTypes.map(t => [t.label, t.color])
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

					// regex.lastIndex 초기화
					regex.lastIndex = 0;

					while ((match = regex.exec(text)) !== null) {
						const matchStart = from + match.index;
						const matchEnd = matchStart + match[0].length;

						// 커서가 이 범위 안에 있으면 스킵
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
	private editorExtensions: any[] = [];

	async onload() {
		await this.loadSettings();
		this.setupExtensions();

		// 설정 탭 추가
		this.addSettingTab(new FocusGaugeSettingTab(this.app, this));
	}

	setupExtensions() {
		// Live Preview (편집 모드)용
		this.registerEditorExtension(createFocusGaugePlugin(this.settings));

		// Reading View (읽기 모드)용
		this.registerMarkdownPostProcessor((element) => {
			// 특수 문자 이스케이프 함수
			const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// 동적 정규표현식 생성
			const typeLabels = this.settings.gaugeTypes.map(t => t.label).join('');
			const prefix = escapeRegex(this.settings.syntaxPrefix);
			const suffix = escapeRegex(this.settings.syntaxSuffix);
			const separator = escapeRegex(this.settings.syntaxSeparator);
			const regex = new RegExp(`${prefix}([${typeLabels}])${separator}(\\d{1,2})${suffix}`, 'g');
			const typeColorMap = new Map(
				this.settings.gaugeTypes.map(t => [t.label, t.color])
			);

			// 모든 텍스트 노드를 순회
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
				const text = textNode.nodeValue!;
				if (regex.test(text)) {
					const span = document.createElement("span");

					// HTML 생성
					regex.lastIndex = 0;
					span.innerHTML = text.replace(regex, (_, type, v) => {
						const value = Math.min(Math.max(parseInt(v), 0), 10);
						const color = typeColorMap.get(type) || '#888888';
						return `<span class="focus-gauge focus-${type}" style="--value:${value}; --color:${color}"></span>`;
					});

					textNode.replaceWith(span);
				}
			}
		});
	}

	refreshExtension() {
		// 에디터 새로고침을 위해 workspace를 다시 로드
		this.app.workspace.updateOptions();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
