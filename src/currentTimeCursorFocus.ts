import { Editor } from "obsidian";

interface TimeBlockLike {
	line: number;
}

export class CurrentTimeCursorFocus {
	focus(editor: Editor, timeBlocks: TimeBlockLike[], currentBlockIndex: number): void {
		if (currentBlockIndex < 0) return;

		const currentBlock = timeBlocks[currentBlockIndex];
		if (!currentBlock) return;

		const cursorLine = editor.getCursor().line;
		const nextBlockLine = timeBlocks[currentBlockIndex + 1]?.line ?? editor.lineCount();
		const currentBlockLineText = editor.getLine(currentBlock.line);
		const currentBlockIndent = currentBlockLineText.search(/\S/);

		if (cursorLine === currentBlock.line) {
			return;
		}

		for (let i = currentBlock.line + 1; i < nextBlockLine; i++) {
			const lineText = editor.getLine(i);
			const trimmedLine = lineText.trim();

			if (trimmedLine === "") {
				if (cursorLine === i) {
					return;
				}
				continue;
			}

			const lineIndent = lineText.search(/\S/);
			if (lineIndent > currentBlockIndent) {
				if (cursorLine === i) {
					return;
				}
				continue;
			}

			break;
		}

		const lineText = editor.getLine(currentBlock.line);
		editor.setCursor({ line: currentBlock.line, ch: lineText.length });
	}
}
