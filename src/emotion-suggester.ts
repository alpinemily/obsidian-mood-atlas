import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from 'obsidian';
import type MoodAtlasPlugin from './main';

import comboList from './emotions/hoffman-nvc-combo.json';
import hoffmanList from './emotions/hoffman.json';
import nvcList from './emotions/nvc.json';

export interface EmotionSuggestion {
	emotion: string;
	emotionRegion: string;
}

const DEFAULT_EMOTION_DATA: Record<string, Record<string, string[]>> = {
	'combo': comboList as Record<string, string[]>,
	'hoffman': hoffmanList as Record<string, string[]>,
	'nvc': nvcList as Record<string, string[]>,
};

function capitalize(s: string): string {
	return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Build an inverted lookup: lowercase emotion word → one group of siblings per region.
 * A word that appears in multiple regions produces multiple groups.
 * Custom word overrides per region are applied before building.
 * Labels are always stored with the first letter capitalised.
 */
function buildLookup(wordList: string, customWords: Record<string, string[]>): Map<string, EmotionSuggestion[][]> {
	const data = DEFAULT_EMOTION_DATA[wordList] ?? {};
	const lookup = new Map<string, EmotionSuggestion[][]>();

	for (const [region, defaultEmotions] of Object.entries(data)) {
		const emotions = customWords[region] ?? defaultEmotions;
		const suggestions = emotions.map(e => ({ emotion: capitalize(e), emotionRegion: region }));
		for (const emotion of emotions) {
			const key = emotion.toLowerCase();
			const existing = lookup.get(key);
			if (existing) {
				existing.push(suggestions);
			} else {
				lookup.set(key, [suggestions]);
			}
		}
	}

	return lookup;
}

/**
 * Mirror the casing of `query` onto `label`.
 *   "happy"  → "calm"   (all lowercase)
 *   "Happy"  → "Calm"   (first-letter capitalised — label is already stored this way)
 *   "HAPPY"  → "CALM"   (all caps)
 */
function matchCase(query: string, label: string): string {
	if (query === query.toUpperCase()) return label.toUpperCase();
	if (query[0] !== undefined && query[0] === query[0].toUpperCase()) return label;
	return label.toLowerCase();
}

const GRID_THRESHOLD = 5;
const WIDE_GRID_THRESHOLD = 18;
const WIDER_GRID_THRESHOLD = 28;

export class EmotionSuggester extends EditorSuggest<EmotionSuggestion> {

	private plugin: MoodAtlasPlugin;
	private _lookup: Map<string, EmotionSuggestion[][]>;
	private suggestionCount = 0;
	private renderIndex = 0;
	private groupStarts: number[] = [];
	private groupEnds: number[] = [];
	private groupLabels: string[] = [];

	constructor(app: App, plugin: MoodAtlasPlugin) {
		super(app);
		this.plugin = plugin;
		this._lookup = this.buildCurrentLookup();
	}

	rebuildLookup(): void {
		this._lookup = this.buildCurrentLookup();
	}

	private buildCurrentLookup(): Map<string, EmotionSuggestion[][]> {
		const { wordList, customWords } = this.plugin.settings;
		return buildLookup(wordList, customWords[wordList] ?? {});
	}

	private get lookup(): Map<string, EmotionSuggestion[][]> {
		return this._lookup;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile | null
	): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const trigger = this.plugin.settings.triggerChar;

		if (line[cursor.ch - 1] !== trigger || cursor.ch < 2 || line[cursor.ch - 2] === ' ') return null;

		let i = cursor.ch - 1;

		// Extract the last word in the line (loop marginially faster than regex)
		const lastWordEnd = i;
		while (i > 0 && line[i - 1] !== ' ') i--;
		const lastWordStart = i;
		const lastWord = line.substring(lastWordStart, lastWordEnd);

		// Check for two word emotions first (e.g. "Burned Out", "Shut Down")
		if (lastWordStart > 0) {
			let j = lastWordStart;
			while (j > 0 && line[j - 1] === ' ') j--;
			if (j > 0) {
				const prevWordEnd = j;
				while (j > 0 && line[j - 1] !== ' ') j--;
				const twoWord = line.substring(j, prevWordEnd) + ' ' + lastWord;
				if (this.lookup.has(twoWord.toLowerCase())) {
					return { start: { line: cursor.line, ch: j }, end: cursor, query: twoWord };
				}
			}
		}

		// Fall back to single word emotions
		if (this.lookup.has(lastWord.toLowerCase())) {
			return { start: { line: cursor.line, ch: lastWordStart }, end: cursor, query: lastWord };
		}

		return null;
	}

	getSuggestions(context: EditorSuggestContext): EmotionSuggestion[] {
		const groups = this.lookup.get(context.query.toLowerCase()) ?? [];
		const flat = groups.flat();
		this.suggestionCount = flat.length;
		this.renderIndex = 0;
		this.groupStarts = [];
		this.groupEnds = [];
		this.groupLabels = [];
		let count = 0;
		for (const group of groups) {
			this.groupStarts.push(count);
			count += group.length;
			this.groupEnds.push(count);
			this.groupLabels.push(group[0]?.emotionRegion ?? '');
		}
		return flat;
	}

	renderSuggestion(suggestion: EmotionSuggestion, el: HTMLElement): void {
		const isGrid = this.suggestionCount > GRID_THRESHOLD;
		const isWideGrid = this.suggestionCount > WIDE_GRID_THRESHOLD;
		const isWiderGrid = this.suggestionCount > WIDER_GRID_THRESHOLD;
		el.parentElement?.toggleClass('mood-atlas-grid', isGrid);
		el.parentElement?.toggleClass('mood-atlas-grid-4', isWideGrid);
		el.parentElement?.toggleClass('mood-atlas-grid-5', isWiderGrid);
		// Also widen the popup container so it doesn't clip the 5-column grid
		el.parentElement?.parentElement?.toggleClass('mood-atlas-popup-wide', isWiderGrid);

		const isMultiGroup = this.groupLabels.length > 1;

		// Multi-group: insert region label as a header ABOVE the first item of each group
		if (isMultiGroup) {
			const groupIdx = this.groupStarts.indexOf(this.renderIndex);
			if (groupIdx !== -1 && this.groupLabels[groupIdx] && el.parentElement) {
				const header = el.parentElement.createEl('div', {
					cls: 'mood-atlas-footer',
					text: `Emotion Region: ${this.groupLabels[groupIdx]}`,
				});
				el.parentElement.insertBefore(header, el);
			}
		}

		el.createDiv({ cls: 'mood-atlas-suggestion' })
			.createSpan({ cls: 'mood-atlas-label', text: suggestion.emotion });

		// Single group: append region footer below the last item (original behaviour)
		this.renderIndex++;
		if (!isMultiGroup) {
			const groupIdx = this.groupEnds.indexOf(this.renderIndex);
			if (groupIdx !== -1 && this.groupLabels[groupIdx]) {
				el.parentElement?.createEl('div', {
					cls: 'mood-atlas-footer',
					text: `Emotion Region: ${this.groupLabels[groupIdx]}`,
				});
			}
		}
	}

	selectSuggestion(
		suggestion: EmotionSuggestion,
		_evt: MouseEvent | KeyboardEvent
	): void {
		const { context } = this;
		if (!context) return;

		context.editor.replaceRange(matchCase(context.query, suggestion.emotion), context.start, context.end);
	}
}
