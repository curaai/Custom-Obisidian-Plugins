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
import { collapseTimeBlocksExceptCurrent } from "./timeBlockCollapse";

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

	const trimmedHeader = enabledHeader.trim();

	// 현재 라인보다 위로 올라가면서 헤더 찾기
	for (let i = lineNumber; i >= 1; i--) {
		const line = view.state.doc.line(i);
		const lineText = line.text.trim();

		// 설정된 헤더를 찾으면 true (양쪽 trim하여 비교)
		if (lineText === trimmedHeader) {
			return true;
		}

		// 다른 헤더를 먼저 만나면 false (더 상위 섹션)
		if (lineText.startsWith("#") && lineText !== trimmedHeader) {
			// 같은 레벨 또는 상위 레벨 헤더인지 확인
			const enabledLevel = trimmedHeader.match(/^#+/)?.[0].length || 0;
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
	const regex = new RegExp(`${prefix}([${typeLabels}])${separator}(\\d{1,2})${suffix}`, 'gi');

	// 타입-색상 매핑 생성 (대소문자 모두 지원)
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

					// regex.lastIndex 초기화
					regex.lastIndex = 0;

					while ((match = regex.exec(text)) !== null) {
						const matchStart = from + match.index;
						const matchEnd = matchStart + match[0].length;

						// 커서가 이 범위 안에 있으면 스킵
						if (cursorPos >= matchStart && cursorPos <= matchEnd) {
							continue;
						}

						// enabledHeader 하위에 있는지 확인
						const lineNumber = view.state.doc.lineAt(matchStart).number;
						if (!isUnderEnabledHeader(view, lineNumber, settings.enabledHeader)) {
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
	private autoCollapseTimeout: NodeJS.Timeout | null = null;

	async onload() {
		await this.loadSettings();
		this.setupExtensions();

		// 설정 탭 추가
		this.addSettingTab(new FocusGaugeSettingTab(this.app, this));

		// 시간 블록 접기 명령어 추가
		this.addCommand({
			id: 'collapse-time-blocks-except-current',
			name: '현재 시간 외 타임블록 접기',
			callback: () => {
				collapseTimeBlocksExceptCurrent(this.app, this.settings);
			}
		});

		// 파일이 열릴 때 자동으로 시간 블록 접기
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (this.settings.autoCollapseTimeBlocks && file) {
					// 짧은 딜레이 후 실행 (파일이 완전히 로드되고 렌더링된 후)
					if (this.autoCollapseTimeout) {
						clearTimeout(this.autoCollapseTimeout);
					}
					this.autoCollapseTimeout = setTimeout(() => {
						collapseTimeBlocksExceptCurrent(this.app, this.settings, true);
					}, 300);
				}
			})
		);

		// 윈도우가 포커스될 때 자동으로 시간 블록 접기
		this.registerDomEvent(window, 'focus', () => {
			if (this.settings.autoCollapseTimeBlocks) {
				if (this.autoCollapseTimeout) {
					clearTimeout(this.autoCollapseTimeout);
				}
				this.autoCollapseTimeout = setTimeout(() => {
					collapseTimeBlocksExceptCurrent(this.app, this.settings, true);
				}, 300);
			}
		});
	}

	setupExtensions() {
		// Live Preview (편집 모드)용
		this.registerEditorExtension(createFocusGaugePlugin(this.settings));

		// Reading View (읽기 모드)용
		this.registerMarkdownPostProcessor((element, context) => {
			// enabledHeader가 설정되어 있으면 해당 섹션인지 확인
			if (this.settings.enabledHeader) {
				const trimmedHeader = this.settings.enabledHeader.trim();

				// element의 부모들을 거슬러 올라가며 헤더 찾기
				let currentElement = element as HTMLElement;
				let foundHeader = false;

				// 섹션 정보 확인
				const sectionInfo = context.getSectionInfo(element);
				if (sectionInfo) {
					const fileContent = context.sourcePath;
					// 파일의 해당 라인들을 확인하여 헤더 하위인지 판단
					// Reading View에서는 정확한 체크가 어려우므로 일단 스킵
					// Live Preview에서만 정확하게 동작하도록 함
				}

				// 간단한 체크: 상위 헤딩 요소 찾기
				while (currentElement && currentElement !== document.body) {
					if (currentElement.previousElementSibling) {
						const prev = currentElement.previousElementSibling;
						if (prev.tagName && prev.tagName.match(/^H[1-6]$/)) {
							const headerText = prev.textContent?.trim() || '';
							if (headerText === trimmedHeader) {
								foundHeader = true;
								break;
							}
							// 다른 헤더를 만나면 false
							break;
						}
					}
					currentElement = currentElement.parentElement as HTMLElement;
				}

				if (!foundHeader) {
					return; // enabledHeader 섹션이 아니면 처리 안 함
				}
			}

			// 특수 문자 이스케이프 함수
			const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// 동적 정규표현식 생성
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
		// enabledHeader의 앞뒤 공백 제거
		if (this.settings.enabledHeader) {
			this.settings.enabledHeader = this.settings.enabledHeader.trim();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
