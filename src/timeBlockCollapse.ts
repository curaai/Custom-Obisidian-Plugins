import { App, MarkdownView, Notice, TFile, Editor } from "obsidian";
import { getDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { FocusGaugeSettings } from "./settings";
import { foldable, foldEffect } from "@codemirror/language";

interface TimeBlock {
	line: number;
	time: string;
	indent: number;
}

function isTodayNote(file: TFile): boolean {
	try {
		const dailyNotes = getAllDailyNotes();
		const today = window.moment();
		const todayNote = getDailyNote(today, dailyNotes);
		return todayNote?.path === file.path;
	} catch (error) {
		console.error("Daily Notes plugin is not enabled:", error);
		return false;
	}
}

function isUnderEnabledHeader(
	editor: Editor,
	lineNumber: number,
	enabledHeader: string
): boolean {
	if (!enabledHeader) return true;

	for (let i = lineNumber; i >= 0; i--) {
		const lineText = editor.getLine(i).trim();

		if (lineText === enabledHeader.trim()) {
			return true;
		}

		if (lineText.startsWith("#") && lineText !== enabledHeader) {
			const enabledLevel = enabledHeader.match(/^#+/)?.[0].length || 0;
			const currentLevel = lineText.match(/^#+/)?.[0].length || 0;
			if (currentLevel <= enabledLevel) {
				return false;
			}
		}
	}

	return false;
}

function parseTimeBlock(line: string): string | null {
	const match = line.trim().match(/^-\s+(\d+)/);
	if (match && match[1]) {
		const hour = parseInt(match[1]);
		if (hour >= 0 && hour <= 23) {
			return String(hour).padStart(2, '0') + ':00';
		}
	}
	return null;
}

function timeToMinutes(time: string): number {
	const [hours = '0', minutes = '0'] = time.split(':');
	return parseInt(hours) * 60 + parseInt(minutes);
}

function findTimeBlocks(
	editor: Editor,
	settings: FocusGaugeSettings
): TimeBlock[] {
	const timeBlocks: TimeBlock[] = [];
	const lineCount = editor.lineCount();

	for (let i = 0; i < lineCount; i++) {
		if (!isUnderEnabledHeader(editor, i, settings.enabledHeader)) {
			continue;
		}

		const lineText = editor.getLine(i);
		const time = parseTimeBlock(lineText);

		if (time) {
			const indent = lineText.search(/\S/);
			timeBlocks.push({ line: i, time, indent });
		}
	}

	return timeBlocks;
}

function findCurrentBlockIndex(
	timeBlocks: TimeBlock[],
	currentHour: number
): { index: number; exactMatch: boolean } {
	// 정확히 일치하는 블록 찾기
	for (let i = 0; i < timeBlocks.length; i++) {
		const block = timeBlocks[i];
		if (!block) continue;

		const hourStr = block.time.split(':')[0];
		if (hourStr && parseInt(hourStr) === currentHour) {
			return { index: i, exactMatch: true };
		}
	}

	// 가장 가까운 이전 블록 찾기
	const currentMinutes = currentHour * 60;
	for (let i = timeBlocks.length - 1; i >= 0; i--) {
		const block = timeBlocks[i];
		if (block && timeToMinutes(block.time) <= currentMinutes) {
			return { index: i, exactMatch: false };
		}
	}

	return { index: 0, exactMatch: false };
}

async function createCurrentTimeBlock(
	editor: Editor,
	settings: FocusGaugeSettings,
	currentHour: number
): Promise<boolean> {
	const lineCount = editor.lineCount();
	let headerLine = -1;
	const existingBlocks: { line: number; hour: number }[] = [];

	for (let i = 0; i < lineCount; i++) {
		const lineText = editor.getLine(i);
		const trimmedLine = lineText.trim();

		if (trimmedLine === settings.enabledHeader.trim()) {
			headerLine = i;
			continue;
		}

		if (headerLine !== -1) {
			const match = lineText.trim().match(/^-\s+(\d+)/);
			if (match && match[1]) {
				const hour = parseInt(match[1]);
				if (hour >= 0 && hour <= 23) {
					existingBlocks.push({ line: i, hour });
				}
			}

			if (trimmedLine.startsWith("#") && trimmedLine !== settings.enabledHeader.trim()) {
				break;
			}
		}
	}

	if (headerLine === -1) return false;
	if (existingBlocks.some(block => block.hour === currentHour)) return false;

	let insertLine = headerLine + 1;
	for (const block of existingBlocks) {
		if (block.hour < currentHour) {
			insertLine = block.line + 1;
		} else {
			break;
		}
	}

	const newBlockText = `- ${currentHour}`;
	editor.replaceRange(newBlockText + '\n', { line: insertLine, ch: 0 });
	editor.setCursor({ line: insertLine, ch: newBlockText.length });

	return true;
}

function hasChildren(
	editor: Editor,
	block: TimeBlock,
	nextBlock: TimeBlock | undefined,
	lineCount: number
): boolean {
	const endLine = nextBlock ? nextBlock.line - 1 : lineCount - 1;

	for (let j = block.line + 1; j <= endLine; j++) {
		const lineText = editor.getLine(j);
		if (lineText.trim() !== "" && lineText.search(/\S/) > block.indent) {
			return true;
		}
	}

	return false;
}

export async function collapseTimeBlocksExceptCurrent(
	app: App,
	settings: FocusGaugeSettings,
	silent = false
) {
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		if (!silent) new Notice("활성화된 마크다운 뷰가 없습니다.");
		return;
	}

	const file = activeView.file;
	if (!file || !isTodayNote(file)) {
		if (!silent) new Notice("오늘 날짜의 Daily Note가 아닙니다.");
		return;
	}

	const editor = activeView.editor;
	const timeBlocks = findTimeBlocks(editor, settings);

	if (timeBlocks.length === 0) {
		if (!silent) new Notice("시간 블록을 찾을 수 없습니다.");
		return;
	}

	const currentHour = new Date().getHours();
	const currentBlockResult = findCurrentBlockIndex(timeBlocks, currentHour);

	// 정확히 일치하는 블록이 없으면 생성
	if (!currentBlockResult.exactMatch && settings.autoCreateTimeBlock) {
		const created = await createCurrentTimeBlock(editor, settings, currentHour);
		if (created) {
			if (!silent) new Notice(`${currentHour}시 블록을 생성했습니다.`);
			return;
		}
	}

	const currentBlockIndex = currentBlockResult.index;
	const linesToFold: number[] = [];
	const lineCount = editor.lineCount();

	for (let i = 0; i < timeBlocks.length; i++) {
		if (i === currentBlockIndex) continue;

		const block = timeBlocks[i];
		if (!block) continue;

		if (hasChildren(editor, block, timeBlocks[i + 1], lineCount)) {
			linesToFold.push(block.line);
		}
	}

	if (linesToFold.length === 0) {
		if (!silent) new Notice("접을 시간 블록이 없습니다.");
		return;
	}

	// @ts-ignore
	const cmEditor = activeView.editor.cm as any;
	if (!cmEditor) {
		if (!silent) new Notice("에디터를 찾을 수 없습니다.");
		return;
	}

	const effects = [];
	for (const lineNum of linesToFold) {
		try {
			const line = cmEditor.state.doc.line(lineNum + 1);
			const range = foldable(cmEditor.state, line.from, line.to);
			if (range) {
				effects.push(foldEffect.of(range));
			}
		} catch (error) {
			// 무시
		}
	}

	if (effects.length > 0) {
		try {
			cmEditor.dispatch({ effects });
		} catch (error) {
			// 무시
		}
	}

	if (currentBlockIndex !== -1) {
		const currentBlock = timeBlocks[currentBlockIndex];
		if (currentBlock) {
			const lineText = editor.getLine(currentBlock.line);
			editor.setCursor({ line: currentBlock.line, ch: lineText.length });
		}
	}

	if (!silent) {
		const now = new Date();
		const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
		new Notice(`${effects.length}개의 시간 블록을 접었습니다. (현재 시간: ${currentTime})`);
	}
}
