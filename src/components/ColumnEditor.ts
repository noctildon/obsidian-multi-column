import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, CompletionContext, Completion } from '@codemirror/autocomplete';
import MultiColumnPlugin from '../main';


export class ColumnEditor {
    // popup window editor
	private view: EditorView | null = null;
	private sourcePath: string;

    constructor(
        private plugin: MultiColumnPlugin,
        private parent: HTMLElement,
        initial: string,
        sourcePath: string,
        private onChange: (value: string) => void
    ) {
        this.sourcePath = sourcePath;
        this.init(initial);
    }

    getValue(): string {
        return this.view?.state.doc.toString() ?? '';
    }

    setValue(value: string): void {
        if (this.view) {
            this.view.dispatch({
                changes: {
                    from: 0,
                    to: this.view.state.doc.length,
                    insert: value
                }
            });
        }
    }

    focus(): void {
        this.view?.focus();
    }

    destroy(): void {
        this.view?.destroy();
    }

	private init(initial: string) {
        // Custom wikilink completion source
        const wikilinkCompletion = (context: CompletionContext) => {
            const match = context.matchBefore(/\[\[[^\]]*/);
            if (!match) return null;
            if (match.text === '[[' && !context.explicit) return null;

            const query = match.text.slice(2); // remove [[
            const files = this.plugin.app.vault.getMarkdownFiles();
            const lowerQuery = query.toLowerCase();
            const filtered = files.filter(f => {
                const name = f.basename.toLowerCase();
                return !lowerQuery || name.startsWith(lowerQuery) || name.includes(lowerQuery);
            }).slice(0, 50); // cap to avoid huge lists

            const options: Completion[] = filtered.map(f => {
                const label = f.basename;
                return {
                    label,
                    type: 'wiki',
                    apply: (view, completion, from, to) => {
                        let insert = label;
                        const end = to;
                        const after = view.state.sliceDoc(end, end + 2);
                        if (after !== ']]') insert += ']]';
                        view.dispatch({
                            changes: { from: match.from + 2, to: end, insert },
                            selection: { anchor: match.from + 2 + label.length }
                        });
                    }
                };
            });

            return {
                from: match.from + 2, // start after [[
                options,
                validFor: /[^\]\n]*/
            };
        };

		const workspaceExtensions = this.plugin.app.workspace.editorExtensions || [];
		const extensions = [
            ...workspaceExtensions,
            markdown(),
            autocompletion({ override: [wikilinkCompletion] }),
            EditorView.updateListener.of((vu) => {
                if (vu.docChanged) this.onChange(this.getValue());
            })
        ];

		this.view = new EditorView({
			state: EditorState.create({
				doc: initial,
				extensions: extensions
			}),
			parent: this.parent
		});
	}
}

export default ColumnEditor;
