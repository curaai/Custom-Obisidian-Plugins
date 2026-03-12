import { Editor } from "obsidian";

interface TimeBlockLike {
	line: number;
}

interface AnchorCandidate {
	line: number;
	ch: number;
	distance: number;
}

export class CurrentTimeCursorFocus {
	private readonly cursorAnchorRegex = /\((?:c|w|l|r)\s*(\d+)?\s*\)/gi;

	private getAnchorTargetCh(anchorMatch: RegExpExecArray): number {
		const anchorStart = anchorMatch.index;
		const anchorToken = anchorMatch[0];
		const oneBasedStr = anchorMatch[1];

		if (oneBasedStr) {
			const oneBased = parseInt(oneBasedStr, 10);
			return Math.max(oneBased - 1, 0);
		}

		// Place cursor inside anchor, right before closing ')'
		return anchorStart + anchorToken.length - 1;
	}

	focusNearestAnchor(editor: Editor, timeBlocks: TimeBlockLike[]): boolean {
		const cursor = editor.getCursor();
		if (timeBlocks.length === 0) return false;

		let bestBeforeCursorCandidate: AnchorCandidate | null = null;
		let bestCandidate: AnchorCandidate | null = null;

		for (let blockIndex = 0; blockIndex < timeBlocks.length; blockIndex++) {
			const block = timeBlocks[blockIndex];
			if (!block) continue;

			const blockLineText = editor.getLine(block.line);
			const blockIndent = blockLineText.search(/\S/);
			const nextBlockLine = timeBlocks[blockIndex + 1]?.line ?? editor.lineCount();

			for (let line = block.line + 1; line < nextBlockLine; line++) {
				const lineText = editor.getLine(line);
				const trimmedLine = lineText.trim();

				if (trimmedLine === "") {
					continue;
				}

				const lineIndent = lineText.search(/\S/);
				if (lineIndent <= blockIndent) {
					break;
				}

				this.cursorAnchorRegex.lastIndex = 0;
				let anchorMatch: RegExpExecArray | null;
				while ((anchorMatch = this.cursorAnchorRegex.exec(lineText)) !== null) {
					const targetCh = Math.min(this.getAnchorTargetCh(anchorMatch), lineText.length);
					const lineDistance = Math.abs(line - cursor.line);
					const chDistance = line === cursor.line ? Math.abs(targetCh - cursor.ch) : 0;
					const distance = lineDistance * 100000 + chDistance;
					const isBeforeCursor =
						line < cursor.line || (line === cursor.line && targetCh <= cursor.ch);

					if (!bestCandidate || distance < bestCandidate.distance) {
						bestCandidate = { line, ch: targetCh, distance };
					}

					if (isBeforeCursor && (!bestBeforeCursorCandidate || distance < bestBeforeCursorCandidate.distance)) {
						bestBeforeCursorCandidate = { line, ch: targetCh, distance };
					}
				}
			}
		}

		const targetCandidate = bestBeforeCursorCandidate ?? bestCandidate;
		if (!targetCandidate) {
			return false;
		}

		editor.setCursor({ line: targetCandidate.line, ch: targetCandidate.ch });
		return true;
	}

	focus(
		editor: Editor,
		timeBlocks: TimeBlockLike[],
		currentBlockIndex: number,
		useCursorAnchor = false
	): void {
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
				if (useCursorAnchor) {
					this.cursorAnchorRegex.lastIndex = 0;
					const cursorAnchorMatch = this.cursorAnchorRegex.exec(lineText);
					if (cursorAnchorMatch && cursorAnchorMatch.index !== undefined) {
						const targetCh = Math.min(
							this.getAnchorTargetCh(cursorAnchorMatch),
							lineText.length
						);
						editor.setCursor({ line: i, ch: targetCh });
						return;
					}
				}

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
