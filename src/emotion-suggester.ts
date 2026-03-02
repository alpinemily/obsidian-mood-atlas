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

import nvcList from './emotions/nvc.json';
import hoffmanList from './emotions/hoffman.json';

type TwoLayerList = Record<string, string[]>;

export interface EmotionSuggestion {
	label: string;  // The emotion to insert
	path: string;   // Emotional region context, e.g. "Joyful"
}

/**
 * Build an inverted lookup: lowercase emotion word → all siblings in its region.
 *
 * Structure of the JSON files:
 *   { "Region": ["Emotion1", "Emotion2", ...], ... }
 *
 * Each region's suggestion array is built once and shared by reference across
 * all its emotion keys, so memory stays flat despite the inverted index.
 *
 * If an emotion appears in multiple regions, the last region wins.
 */
function buildEmotionLookup(data: TwoLayerList): Map<string, EmotionSuggestion[]> {
	const lookup = new Map<string, EmotionSuggestion[]>();

	for (const [region, emotions] of Object.entries(data)) {
		const suggestions = emotions.map(e => ({ label: e, path: region }));
		for (const emotion of emotions) {
			lookup.set(emotion.toLowerCase(), suggestions);
		}
	}

	return lookup;
}

const LOOKUPS: Record<string, Map<string, EmotionSuggestion[]>> = {
	'hoffman': buildEmotionLookup(hoffmanList as TwoLayerList),
	'nvc': buildEmotionLookup(nvcList as TwoLayerList),
};

/**
 * Mirror the casing of `query` onto `label`.
 *   "happy"    → "playful"   (all lowercase)
 *   "Happy"    → "Playful"   (first-letter capitalised — label is already this from JSON)
 *   "HAPPY"    → "PLAYFUL"   (all caps)
 */
function matchCase(query: string, label: string): string {
	if (query === query.toUpperCase()) return label.toUpperCase();
	if (query[0] !== undefined && query[0] === query[0].toUpperCase()) return label; // JSON labels are already title-cased
	return label.toLowerCase();
}

const GRID_THRESHOLD = 5;
const WIDE_GRID_THRESHOLD = 18;
const WIDER_GRID_THRESHOLD = 28;

export class EmotionSuggester extends EditorSuggest<EmotionSuggestion> {

	private plugin: MoodAtlasPlugin;
	private suggestionCount = 0;
	private renderIndex = 0;
	private parentLabel = '';

	constructor(app: App, plugin: MoodAtlasPlugin) {
		super(app);
		this.plugin = plugin;
	}

	private get lookup(): Map<string, EmotionSuggestion[]> {
		return LOOKUPS[this.plugin.settings.wordList] ?? LOOKUPS['hoffman']!;
	}

	/**
	 * Called on every keypress. Return trigger info when the cursor is right
	 * after "emotion^", otherwise return null.
	 *
	 * Supports multi-word emotions (e.g. "Open Hearted", "Burnt Out") by
	 * trying up to 3-word phrases, longest match first.
	 */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		_file: TFile | null
	): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const beforeCursor = line.substring(0, cursor.ch);

		if (!beforeCursor.endsWith('^')) return null;

		const textBefore = beforeCursor.slice(0, -1); // strip the '^'
		const words = textBefore.trimEnd().split(/\s+/).filter(Boolean);

		if (words.length === 0) return null;

		// Try longest phrase first so "Stressed / Tense" beats "Tense"
		for (let n = Math.min(3, words.length); n >= 1; n--) {
			const phrase = words.slice(-n).join(' ');
			if (this.lookup.has(phrase.toLowerCase())) {
				return {
					start: { line: cursor.line, ch: cursor.ch - 1 - phrase.length },
					end: cursor,
					query: phrase,
				};
			}
		}

		return null;
	}

	getSuggestions(context: EditorSuggestContext): EmotionSuggestion[] {
		const suggestions = this.lookup.get(context.query.toLowerCase()) ?? [];
		this.suggestionCount = suggestions.length;
		this.renderIndex = 0;
		this.parentLabel = suggestions[0]?.path ?? '';

		return suggestions;
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

		el.createDiv({ cls: 'mood-atlas-suggestion' })
			.createSpan({ cls: 'mood-atlas-label', text: suggestion.label });

		// After the last item, append a single footer showing the parent context
		this.renderIndex++;
		if (this.renderIndex === this.suggestionCount && this.parentLabel) {
			el.parentElement?.createEl('div', {
				cls: 'mood-atlas-footer',
				text: `Emotional Region: ${this.parentLabel}`,
			});
		}
	}

	selectSuggestion(
		suggestion: EmotionSuggestion,
		_evt: MouseEvent | KeyboardEvent
	): void {
		const { context } = this;
		if (!context) return;

		context.editor.replaceRange(matchCase(context.query, suggestion.label), context.start, context.end);
	}
}
