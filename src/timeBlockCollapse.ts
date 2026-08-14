import { App, MarkdownView, Notice, TFile, Editor } from "obsidian";
import { getDailyNote, getAllDailyNotes } from "obsidian-daily-notes-interface";
import { FocusGaugeSettings } from "./settings";

interface TimeBlockEntry {
	hour: number;
	lines: string[];
}

interface SectionBounds {
	headerLine: number;
	contentStart: number;
	contentEnd: number;
}

interface SectionData {
	preContent: string[];   // non-time-block lines before first time block
	entries: TimeBlockEntry[];
	postContent: string[];  // non-indented code blocks (dataviewjs, etc.) after time blocks
}

function isTodayNote(file: TFile): boolean {
	try {
		const dailyNotes = getAllDailyNotes();
		const today = window.moment();
		const todayNote = getDailyNote(today, dailyNotes);
		return todayNote?.path === file.path;
	} catch {
		return false;
	}
}

function parseTimeBlockHour(line: string): number | null {
	const match = line.trim().match(/^-\s+(\d+)$/);
	if (match && match[1] !== undefined) {
		const hour = parseInt(match[1]);
		if (hour >= 0 && hour <= 23) return hour;
	}
	return null;
}

function findSectionBounds(editor: Editor, headerText: string): SectionBounds | null {
	const lineCount = editor.lineCount();
	const trimmedHeader = headerText.trim();

	let headerLine = -1;
	for (let i = 0; i < lineCount; i++) {
		if (editor.getLine(i).trim() === trimmedHeader) {
			headerLine = i;
			break;
		}
	}
	if (headerLine === -1) return null;

	const contentStart = headerLine + 1;
	let contentEnd = lineCount - 1;

	for (let i = contentStart; i < lineCount; i++) {
		const trimmed = editor.getLine(i).trim();
		if (trimmed.startsWith('#') || trimmed === '---') {
			contentEnd = i - 1;
			break;
		}
	}

	return { headerLine, contentStart, contentEnd };
}

function parseSection(editor: Editor, bounds: SectionBounds): SectionData {
	const { contentStart, contentEnd } = bounds;
	const preContent: string[] = [];
	const entries: TimeBlockEntry[] = [];
	const postContent: string[] = [];

	if (contentEnd < contentStart) return { preContent, entries, postContent };

	let inCodeBlock = false;
	let foundFirstTimeBlock = false;
	let inPostContent = false;
	let currentEntry: TimeBlockEntry | null = null;

	for (let i = contentStart; i <= contentEnd; i++) {
		const line = editor.getLine(i);
		const trimmed = line.trim();

		// Once in postContent mode, collect everything as-is
		if (inPostContent) {
			if (trimmed.startsWith('```')) inCodeBlock = !inCodeBlock;
			postContent.push(line);
			continue;
		}

		if (trimmed.startsWith('```')) {
			// Non-indented code block after time blocks → postContent
			const lineIndent = line.search(/\S/);
			if (foundFirstTimeBlock && lineIndent === 0) {
				if (currentEntry) { entries.push(currentEntry); currentEntry = null; }
				inCodeBlock = !inCodeBlock;
				inPostContent = true;
				postContent.push(line);
				continue;
			}

			inCodeBlock = !inCodeBlock;
			if (!foundFirstTimeBlock) {
				preContent.push(line);
			} else if (currentEntry) {
				currentEntry.lines.push(line);
			}
			continue;
		}

		if (inCodeBlock) {
			if (!foundFirstTimeBlock) {
				preContent.push(line);
			} else if (currentEntry) {
				currentEntry.lines.push(line);
			}
			continue;
		}

		const hour = parseTimeBlockHour(line);
		if (hour !== null) {
			if (currentEntry) entries.push(currentEntry);
			foundFirstTimeBlock = true;
			currentEntry = { hour, lines: [line] };
		} else if (!foundFirstTimeBlock) {
			preContent.push(line);
		} else if (currentEntry) {
			currentEntry.lines.push(line);
		}
	}

	if (currentEntry) entries.push(currentEntry);

	return { preContent, entries, postContent };
}

function replaceSectionContent(
	editor: Editor,
	bounds: SectionBounds,
	data: SectionData,
	entries: TimeBlockEntry[]
): void {
	// Time block entries first, then non-time-block content (dataviewjs, etc.)
	const newLines: string[] = [];
	for (const entry of entries) {
		newLines.push(...entry.lines);
	}
	newLines.push(...data.preContent);
	newLines.push(...data.postContent);
	const newContent = newLines.join('\n');

	if (bounds.contentEnd < bounds.contentStart) {
		if (newContent) {
			const headerEnd = editor.getLine(bounds.headerLine).length;
			editor.replaceRange('\n' + newContent, { line: bounds.headerLine, ch: headerEnd });
		}
	} else {
		// Skip replacement if content is identical — avoids displacing the cursor
		const existingLines: string[] = [];
		for (let i = bounds.contentStart; i <= bounds.contentEnd; i++) {
			existingLines.push(editor.getLine(i));
		}
		if (existingLines.join('\n') === newContent) return;

		const startPos = { line: bounds.contentStart, ch: 0 };
		const endPos = { line: bounds.contentEnd, ch: editor.getLine(bounds.contentEnd).length };
		editor.replaceRange(newContent, startPos, endPos);
	}
}

export async function archiveTimeBlocks(app: App, settings: FocusGaugeSettings, silent = false): Promise<void> {
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		if (!silent) new Notice("활성화된 마크다운 뷰가 없습니다.");
		return;
	}

	const file = activeView.file;
	if (!file) {
		if (!silent) new Notice("파일을 찾을 수 없습니다.");
		return;
	}

	const editor = activeView.editor;

	const nowBounds = findSectionBounds(editor, settings.nowHeader);
	const timeBlocksBounds = findSectionBounds(editor, settings.timeBlocksHeader);

	if (!nowBounds && !timeBlocksBounds) {
		if (!silent) new Notice("Now 또는 Time Blocks 섹션을 찾을 수 없습니다.");
		return;
	}

	const nowData = nowBounds
		? parseSection(editor, nowBounds)
		: { preContent: [], entries: [], postContent: [] };

	const timeBlocksData = timeBlocksBounds
		? parseSection(editor, timeBlocksBounds)
		: { preContent: [], entries: [], postContent: [] };

	// Merge entries by hour; Now section takes precedence on conflict
	const hourMap = new Map<number, TimeBlockEntry>();
	for (const entry of timeBlocksData.entries) {
		hourMap.set(entry.hour, entry);
	}
	for (const entry of nowData.entries) {
		hourMap.set(entry.hour, entry);
	}

	const isToday = isTodayNote(file);

	let nowEntries: TimeBlockEntry[];
	let archiveEntries: TimeBlockEntry[];

	if (!isToday) {
		nowEntries = [];
		archiveEntries = Array.from(hourMap.values()).sort((a, b) => a.hour - b.hour);
	} else {
		const currentHour = new Date().getHours();
		const prevHour = (currentHour - 1 + 24) % 24;
		const nextHour = (currentHour + 1) % 24;
		const nowHours = new Set([prevHour, currentHour, nextHour]);

		if (!hourMap.has(currentHour) && settings.autoCreateTimeBlock) {
			hourMap.set(currentHour, { hour: currentHour, lines: [`- ${currentHour}`] });
		}
		if (!hourMap.has(nextHour) && settings.autoCreateTimeBlock) {
			hourMap.set(nextHour, { hour: nextHour, lines: [`- ${nextHour}`] });
		}

		const all = Array.from(hourMap.values());
		nowEntries = all.filter(e => nowHours.has(e.hour)).sort((a, b) => a.hour - b.hour);
		archiveEntries = all.filter(e => !nowHours.has(e.hour)).sort((a, b) => a.hour - b.hour);
	}

	// Replace bottom section first to preserve line numbers of top section
	const nowIsBelow = nowBounds && timeBlocksBounds
		&& nowBounds.headerLine > timeBlocksBounds.headerLine;

	if (nowBounds && timeBlocksBounds) {
		if (nowIsBelow) {
			replaceSectionContent(editor, nowBounds, nowData, nowEntries);
			replaceSectionContent(editor, timeBlocksBounds, timeBlocksData, archiveEntries);
		} else {
			replaceSectionContent(editor, timeBlocksBounds, timeBlocksData, archiveEntries);
			replaceSectionContent(editor, nowBounds, nowData, nowEntries);
		}
	} else if (nowBounds) {
		replaceSectionContent(editor, nowBounds, nowData, nowEntries);
	} else if (timeBlocksBounds) {
		replaceSectionContent(editor, timeBlocksBounds, timeBlocksData, archiveEntries);
	}

	if (!silent) {
		if (!isToday) {
			new Notice("오늘이 아니어서 Now 블록을 Time Blocks로 이동했습니다.");
		} else {
			const now = new Date();
			const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
			new Notice(`시간 블록을 정리했습니다. (현재 시간: ${t})`);
		}
	}
}
