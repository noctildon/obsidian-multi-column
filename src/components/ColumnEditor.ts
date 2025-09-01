import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
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
		this.view = new EditorView({
			state: EditorState.create({
				doc: initial,
				extensions: [
					EditorView.updateListener.of((vu) => {
						if (vu.docChanged) this.onChange(this.getValue());
					})
				]
			}),
			parent: this.parent
		});
	}
}

export default ColumnEditor;
