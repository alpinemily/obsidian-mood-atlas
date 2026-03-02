import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from 'obsidian';

// Import the feelings wheel JSON as our source of truth
import feelingsWheel from './emotions/feelings-wheel.json';

type FeelingsWheel = Record<string, Record<string, string[]>>;

export interface EmotionSuggestion {
	label: string;  // The emotion to insert
	path: string;   // Breadcrumb context, e.g. "Happy > Playful"
}

/**
 * Build a flat lookup: lowercase emotion word → list of finer-grained suggestions.
 *
 * Structure of feelings-wheel.json:
 *   { Primary: { Secondary: [Tertiary, ...], ... }, ... }
 *
 * Lookup entries created:
 *   "happy"   → secondary children of Happy  (Playful, Content, ...)
 *   "playful" → tertiary children of Playful (Aroused, Cheeky)
 *   "lonely"  → tertiary children of Lonely  (Isolated, Abandoned)
 *
 * Tertiary (leaf) emotions are NOT added — there's nothing to drill into.
 */
function buildEmotionLookup(): Map<string, EmotionSuggestion[]> {
	const lookup = new Map<string, EmotionSuggestion[]>();
	const wheel = feelingsWheel as FeelingsWheel;

	for (const [primary, secondaries] of Object.entries(wheel)) {
		// primary → its secondary children
		lookup.set(
			primary.toLowerCase(),
			Object.keys(secondaries).map(s => ({ label: s, path: primary }))
		);

		// secondary → its tertiary children
		for (const [secondary, tertiaries] of Object.entries(secondaries)) {
			lookup.set(
				secondary.toLowerCase(),
				tertiaries.map(t => ({ label: t, path: `${primary} > ${secondary}` }))
			);
		}
	}

	return lookup;
}

const EMOTION_LOOKUP = buildEmotionLookup();

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

export class EmotionSuggester extends EditorSuggest<EmotionSuggestion> {

	private suggestionCount = 0;
	private renderIndex = 0;
	private parentLabel = '';

	/**
	 * Called on every keypress. Return trigger info when the cursor is right
	 * after "emotion^", otherwise return null.
	 *
	 * Supports multi-word emotions (e.g. "Let down") by trying up to 3-word
	 * phrases, longest match first.
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

		// Try longest phrase first so "let down" beats "down"
		for (let n = Math.min(3, words.length); n >= 1; n--) {
			const phrase = words.slice(-n).join(' ');
			if (EMOTION_LOOKUP.has(phrase.toLowerCase())) {
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
		const suggestions = EMOTION_LOOKUP.get(context.query.toLowerCase()) ?? [];
		this.suggestionCount = suggestions.length;
		this.renderIndex = 0;

		// Parent label only exists for tertiary suggestions (path = "Primary > Secondary").
		// Typing a primary emotion gives path = "Primary" (no ">") → no subtext.
		const firstPath = suggestions[0]?.path ?? '';
		const gtIndex = firstPath.indexOf(' > ');
		this.parentLabel = gtIndex !== -1 ? firstPath.substring(0, gtIndex) : '';

		return suggestions;
	}

	renderSuggestion(suggestion: EmotionSuggestion, el: HTMLElement): void {
		const isGrid = this.suggestionCount > GRID_THRESHOLD;
		el.parentElement?.toggleClass('mood-atlas-grid', isGrid);

		el.createDiv({ cls: 'mood-atlas-suggestion' })
			.createSpan({ cls: 'mood-atlas-label', text: suggestion.label });

		// After the last item, append a single footer showing the parent context
		this.renderIndex++;
		if (this.renderIndex === this.suggestionCount && this.parentLabel) {
			el.parentElement?.createEl('div', {
				cls: 'mood-atlas-footer',
				text: `parent word: ${this.parentLabel}`,
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
