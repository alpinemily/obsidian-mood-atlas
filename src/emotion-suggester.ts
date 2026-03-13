import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	KeymapEventHandler,
	Scope,
	TFile,
} from 'obsidian';

/** Obsidian's internal Scope shape — `keys` is not in the public types but is always present. */
interface ScopeWithKeys extends Scope {
	keys: KeymapEventHandler[];
}

/** Obsidian's internal SuggestManager shape used by PopoverSuggest. */
interface SuggestManager<T> {
	selectedItem: number;
	setSelectedItem(index: number, evt: KeyboardEvent | MouseEvent): void;
}

interface PopoverSuggestWithInternals<T> {
	suggestions: SuggestManager<T>;
}
import type MoodAtlasPlugin from './main';
import type { EmotionDatasourceName } from './settings';

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
 * Build an inverted lookup: lowercase emotion word → one group of siblings per emotion region.
 * A word that appears in multiple emotion regions produces multiple groups.
 * Custom word overrides per region are applied before building.
 * Labels are always stored with the first letter capitalized.
 */
function buildLookup(datasourceName: EmotionDatasourceName, customWords: Record<string, string[]>): Map<string, EmotionSuggestion[][]> {
	const data = DEFAULT_EMOTION_DATA[datasourceName] ?? {};
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
 * Mirror the casing of `query` onto `emotion`.
 *   "happy"  → "invigorated"   (all lowercase)
 *   "Happy"  → "Invigorated"   (capitalized — emotion is already stored this way)
 *   "HAPPY"  → "INVIGORATED"   (all caps)
 */
function matchQueryCase(query: string, emotion: string): string {
	if (query === query.toUpperCase()) return emotion.toUpperCase();
	if (query[0] !== undefined && query[0] === query[0].toUpperCase()) return emotion;
	return emotion.toLowerCase();
}

const RENDER_3_COL_WIDE_EMOTION_COUNT_THRESHOLD = 5;
const RENDER_4_COL_WIDE_EMOTION_COUNT_THRESHOLD = 18;
const RENDER_5_COL_WIDE_EMOTION_COUNT_THRESHOLD = 28;

export class EmotionSuggester extends EditorSuggest<EmotionSuggestion> {

	private plugin: MoodAtlasPlugin;
	private _lookup: Map<string, EmotionSuggestion[][]>;
	private suggestionCount = 0;
	private renderIndex = 0;
	private groupStarts: number[] = [];
	private groupEnds: number[] = [];
	private emotionRegionLabels: string[] = [];
	private gridEl: HTMLElement | null = null;

	constructor(app: App, plugin: MoodAtlasPlugin) {
		super(app);
		this.plugin = plugin;
		this._lookup = this.buildCurrentLookup();

		// Override all four arrow keys so the grid navigates by row (up/down) and column (left/right).
		// Obsidian registers built-in ArrowUp/ArrowDown handlers (move by 1) during super(app).
		// Those run first and return false, swallowing the event before our handlers fire.
		// Remove them so our column-aware replacements take over.
		const scopeKeys = (this.scope as ScopeWithKeys).keys;
		for (let i = scopeKeys.length - 1; i >= 0; i--) {
			const k = scopeKeys[i]?.key;
			if (k === 'ArrowUp' || k === 'ArrowDown') {
				scopeKeys.splice(i, 1);
			}
		}

		const suggestions = () => (this as unknown as PopoverSuggestWithInternals<EmotionSuggestion>).suggestions;
		this.scope.register([], 'ArrowLeft', (evt: KeyboardEvent) => {
			suggestions().setSelectedItem(suggestions().selectedItem - 1, evt);
			return false;
		});
		this.scope.register([], 'ArrowRight', (evt: KeyboardEvent) => {
			suggestions().setSelectedItem(suggestions().selectedItem + 1, evt);
			return false;
		});
		this.scope.register([], 'ArrowUp', (evt: KeyboardEvent) => {
			suggestions().setSelectedItem(suggestions().selectedItem - this.getGridColumns(), evt);
			return false;
		});
		this.scope.register([], 'ArrowDown', (evt: KeyboardEvent) => {
			suggestions().setSelectedItem(suggestions().selectedItem + this.getGridColumns(), evt);
			return false;
		});
	}

	rebuildLookup(): void {
		this._lookup = this.buildCurrentLookup();
	}

	private buildCurrentLookup(): Map<string, EmotionSuggestion[][]> {
		const { datasourceName, customUserEmotions } = this.plugin.settings;
		return buildLookup(datasourceName, customUserEmotions[datasourceName] ?? {});
	}

	private get lookup(): Map<string, EmotionSuggestion[][]> {
		return this._lookup;
	}

	/**
	 * Returns the number of columns currently rendered in the suggestion grid by reading
	 * the computed gridTemplateColumns value (e.g. "160px 160px 160px" → 3).
	 * Falls back to 1 when the popup is not in grid mode so up/down still move by one item.
	 */
	private getGridColumns(): number {
		if (!this.gridEl) return 1;
		const computed = getComputedStyle(this.gridEl).gridTemplateColumns;
		if (!computed || computed === 'none') return 1;
		return computed.trim().split(/\s+/).length;
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

	/**
	 * Returns grouped EmotionSuggestions — one group per emotion region the query word
	 * belongs to. Obsidian's API requires a flat array, so the groups are flattened.
	 * To preserve group structure for rendering, we record the flat index where each
	 * group starts and ends (groupStarts, groupEnds) and its emotion region name (emotionRegionLabels).
	 * renderSuggestion uses these to inject region headers/footers at the right positions.
	 */
	getSuggestions(context: EditorSuggestContext): EmotionSuggestion[] {
		const groups = this.lookup.get(context.query.toLowerCase()) ?? [];
		const flat = groups.flat();
		this.suggestionCount = flat.length;
		this.renderIndex = 0;
		this.groupStarts = [];
		this.groupEnds = [];
		this.emotionRegionLabels = [];
		this.gridEl = null;
		let count = 0;
		for (const group of groups) {
			this.groupStarts.push(count);
			count += group.length;
			this.groupEnds.push(count);
			this.emotionRegionLabels.push(group[0]?.emotionRegion ?? '');
		}
		return flat;
	}

	renderSuggestion(suggestion: EmotionSuggestion, el: HTMLElement): void {
		if (el.parentElement) this.gridEl = el.parentElement;
		el.parentElement?.toggleClass('mood-atlas-grid', this.suggestionCount > RENDER_3_COL_WIDE_EMOTION_COUNT_THRESHOLD);
		el.parentElement?.toggleClass('mood-atlas-grid-4', this.suggestionCount > RENDER_4_COL_WIDE_EMOTION_COUNT_THRESHOLD);
		el.parentElement?.toggleClass('mood-atlas-grid-5', this.suggestionCount > RENDER_5_COL_WIDE_EMOTION_COUNT_THRESHOLD);
		// Also widen the popup container so it doesn't clip the 5-column grid
		el.parentElement?.parentElement?.toggleClass('mood-atlas-popup-wide', this.suggestionCount > RENDER_4_COL_WIDE_EMOTION_COUNT_THRESHOLD);

		const isMultiGroup = this.emotionRegionLabels.length > 1;

		// Multi-group: insert region label as a header ABOVE the first item of each group
		if (isMultiGroup) {
			const groupIdx = this.groupStarts.indexOf(this.renderIndex);
			if (groupIdx !== -1 && this.emotionRegionLabels[groupIdx] && el.parentElement) {
				const header = el.parentElement.createEl('div', {
					cls: 'mood-atlas-footer',
					text: `Emotion Region: ${this.emotionRegionLabels[groupIdx]}`,
				});
				el.parentElement.insertBefore(header, el);
			}
		}

		el.createDiv({ cls: 'mood-atlas-suggestion' })
			.createSpan({ cls: 'mood-atlas-emotion', text: suggestion.emotion });

		// Single group: append region footer BELOW the last item because the 'emotion region'
		// is a minor footnote detail. This is in contrast to the multi-group case where the
	    // 'emotion region' acts more as a heading that visually separates the groups
		this.renderIndex++;
		if (!isMultiGroup) {
			const groupIdx = this.groupEnds.indexOf(this.renderIndex);
			if (groupIdx !== -1 && this.emotionRegionLabels[groupIdx]) {
				el.parentElement?.createEl('div', {
					cls: 'mood-atlas-footer',
					text: `Emotion Region: ${this.emotionRegionLabels[groupIdx]}`,
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

		context.editor.replaceRange(matchQueryCase(context.query, suggestion.emotion), context.start, context.end);
	}
}
