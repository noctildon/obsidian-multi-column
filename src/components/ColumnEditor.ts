import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import MultiColumnPlugin from '../main';
import { Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';

function wikilinkPlugin() {
	return ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = this.buildDeco(view);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = this.buildDeco(update.view);
			}
		}
		buildDeco(view: EditorView) {
			const widgets: any[] = [];
			const re = /\[\[[^\]]+\]\]/g;
			for (const { from, to } of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				let m: RegExpExecArray | null;
				while ((m = re.exec(text))) {
					const start = from + m.index;
					const end = start + m[0].length;
					widgets.push(Decoration.mark({ class: 'cm-wikilink', attributes: { 'data-wikilink': m[0] } }).range(start, end));
				}
			}
			return Decoration.set(widgets, true);
		}
	}, { decorations: v => v.decorations });
}

export class ColumnEditor {
    // popup window editor
	private view: EditorView | null = null;
	private language = new Compartment();
	private sourcePath: string;

	constructor(private plugin: MultiColumnPlugin, private parent: HTMLElement, initial: string, sourcePath: string, private onChange: (value: string)=>void) {
		this.sourcePath = sourcePath;
		this.init(initial);
	}

	getValue() { return this.view?.state.doc.toString() ?? ''; }
	setValue(v: string) { if (this.view) { this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: v } }); } }
	focus() { this.view?.focus(); }
	destroy() { this.view?.destroy(); }

	private init(initial: string) {
		this.view = new EditorView({
			state: EditorState.create({
				doc: initial,
				extensions: [
					markdown(),
					this.language.of([]),
					keymap.of([]),
					drawSelection(),
					wikilinkPlugin(),
					EditorView.updateListener.of((vu) => {
						if (vu.docChanged) this.onChange(this.getValue());
					})
				]
			}),
			parent: this.parent
		});

		// Click handler for wikilinks
		this.view.dom.addEventListener('click', (e) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;

            const linkEl = target.closest('[data-wikilink]') as HTMLElement | null;
			if (!linkEl) return;

            // Allow modifier-based new leaf
			const raw = linkEl.getAttribute('data-wikilink');
			if (!raw) return;

            // Extract inner of [[...]]
			const inner = raw.slice(2, -2);
			const pipeIdx = inner.indexOf('|');
			const targetPath = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
			if (!targetPath) return;

            e.preventDefault();
			e.stopPropagation();
			const newLeaf = e.shiftKey || e.button === 1;
			this.plugin.app.workspace.openLinkText(targetPath, this.sourcePath, newLeaf);
		}, { capture: true });
	}
}

export default ColumnEditor;
