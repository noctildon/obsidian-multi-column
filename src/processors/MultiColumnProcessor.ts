import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView } from "obsidian";
import { ColumnEditor } from '../components/ColumnEditor';
import MultiColumnPlugin from "../main";

export class MultiColumnProcessor {
	constructor(private plugin: MultiColumnPlugin) {}

	processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		console.log('Processing code block with source:', source);

		const { config, columnContents } = this.parseConfigAndContent(source);
		console.log('Parsed config:', config, 'Column contents:', columnContents);

		// Create a render child to manage the lifecycle and updates
		const renderChild = new MultiColumnRenderChild(el, this.plugin, ctx, config, columnContents, source);
		ctx.addChild(renderChild);
	}

	private parseConfigAndContent(source: string): { config: any; columnContents: string[] } {
		const lines = source.split('\n');
		const config: any = {
			columns: 2
		};

		const columnContents: string[] = [];
		let currentColumn = -1;
		let inColumnSection = false;

		for (const line of lines) {
			if (line.includes(':') && !inColumnSection) {
				// Parse config
				const [key, value] = line.split(':').map(s => s.trim());
				if (key === 'columns' && value) {
					config.columns = parseInt(value) || 2;
				}
			} else if (line.startsWith('===column===')) {
				// Start of column content
				inColumnSection = true;
				currentColumn++;
				columnContents[currentColumn] = '';
			} else if (inColumnSection) {
				// Column content
				if (columnContents[currentColumn] === undefined) {
					columnContents[currentColumn] = '';
				}
				columnContents[currentColumn] += line + '\n';
			}
		}		// Clean up excessive trailing newlines, but preserve intentional ones
		columnContents.forEach((content, i) => {
			if (content) {
				// Remove only excessive trailing newlines (more than 2)
				columnContents[i] = content.replace(/\n{3,}$/, '\n\n');
			}
		});

		// Ensure we have enough empty columns
		while (columnContents.length < config.columns) {
			columnContents.push('');
		}

		return { config, columnContents };
	}

	createMultiColumnContainer(config: any): HTMLElement {
		const container = document.createElement('div');
		container.className = 'multi-column-container';

		const settings = this.plugin.settingManager.getSettings();
		if (settings.showColumnBorders) {
			container.classList.add('show-borders');
		}

		// Add edit controls if interactive editing is enabled
		if (settings.enableInteractiveEditing) {
			const editControls = this.createEditControls(container, config);
			container.appendChild(editControls);
		}

		// Create content wrapper for horizontal columns
		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'multi-column-content';

		// Columns placeholder wrappers (editor inserted later)
		for (let i = 0; i < config.columns; i++) {
			const column = document.createElement('div');
			column.className = 'multi-column-item';
			column.setAttribute('data-column', i.toString());
			contentWrapper.appendChild(column);
			if (i < config.columns - 1) {
				const resizer = document.createElement('div');
				resizer.className = 'multi-column-resizer';
				this.attachResizerEvents(resizer);
				contentWrapper.appendChild(resizer);
			}
		}

		container.appendChild(contentWrapper);
		return container;
	}

	private createEditControls(container: HTMLElement, config: any): HTMLElement {
		const controls = document.createElement('div');
		controls.className = 'multi-column-controls';
		controls.style.cssText = `
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
			padding: 8px;
			background: var(--background-secondary);
			border-radius: 4px;
			font-size: 12px;
		`;

		// Add column button
		const addBtn = document.createElement('button');
		addBtn.textContent = '+';
		addBtn.title = 'Add column';
		addBtn.style.cssText = `
			padding: 4px 8px;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		`;
		addBtn.onclick = () => this.addColumn(container);

		// Remove column button
		const removeBtn = document.createElement('button');
		removeBtn.textContent = '−';
		removeBtn.title = 'Remove column';
		removeBtn.style.cssText = addBtn.style.cssText;
		removeBtn.onclick = () => this.removeColumn(container);

		controls.appendChild(addBtn);
		controls.appendChild(removeBtn);

		return controls;
	}

	// attachColumnEvents removed (replaced by CodeMirror editor)

	private addColumn(container: HTMLElement) {
		const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
		if (!contentWrapper) return;

		const columns = contentWrapper.querySelectorAll('.multi-column-item');
		// Create new column wrapper
		const newColumn = document.createElement('div');
		newColumn.className = 'multi-column-item';
		newColumn.setAttribute('data-column', columns.length.toString());
		if (columns.length > 0) {
			const resizer = document.createElement('div');
			resizer.className = 'multi-column-resizer';
			this.attachResizerEvents(resizer);
			contentWrapper.appendChild(resizer);
		}
		contentWrapper.appendChild(newColumn);
	}

	private removeColumn(container: HTMLElement) {
		const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
		if (!contentWrapper) return;

		const columns = contentWrapper.querySelectorAll('.multi-column-item');
		const resizers = contentWrapper.querySelectorAll('.multi-column-resizer');

		if (columns.length > 1) {
			// Remove last column and its resizer
			const lastColumn = columns[columns.length - 1] as HTMLElement;
			const lastResizer = resizers[resizers.length - 1] as HTMLElement;

			if (lastColumn) {
				lastColumn.remove();
			}
			if (lastResizer) {
				lastResizer.remove();
			}
		}
	}

	attachResizerEvents(resizer: HTMLElement) {
		let isResizing = false;
		let startX: number;
		let startWidth: number;

		resizer.addEventListener('mousedown', (e) => {
			isResizing = true;
			startX = e.clientX;

			const prevColumn = resizer.previousElementSibling as HTMLElement;
			startWidth = prevColumn.offsetWidth;

			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		});

		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;

			const deltaX = e.clientX - startX;
			const prevColumn = resizer.previousElementSibling as HTMLElement;
			const newWidth = startWidth + deltaX;

			if (newWidth > 50) { // Minimum column width
				prevColumn.style.width = newWidth + 'px';
			}
		};

		const handleMouseUp = () => {
			isResizing = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}

	cleanup() {
		// Clean up any event listeners or resources
	}
}

class MultiColumnRenderChild extends MarkdownRenderChild {
	private container: HTMLElement;
	private columnContents: string[];
	private originalSource: string;
	private editors: ColumnEditor[] = [];

	constructor(
		containerEl: HTMLElement,
		private plugin: MultiColumnPlugin,
		private ctx: MarkdownPostProcessorContext,
		private config: any,
		columnContents: string[],
		originalSource: string
	) {
		super(containerEl);
		this.columnContents = [...columnContents];
		this.originalSource = originalSource;
		this.render();
	}

	private render() {
		this.containerEl.empty();

		// Create the multi-column container using the processor's methods
		const processor = new MultiColumnProcessor(this.plugin);
		this.container = processor.createMultiColumnContainer(this.config);

		// Load existing content into columns
		this.loadColumnContents();

		this.containerEl.appendChild(this.container);

		// Set up auto-save on content changes
		this.setupAutoSave();
	}

	private loadColumnContents() {
		const wrappers = this.container.querySelectorAll('.multi-column-item');
		this.editors.forEach(e => e.destroy());
		this.editors = [];
		wrappers.forEach((wrap, idx) => {
			const initial = this.columnContents[idx] ?? '';
			const editor = new ColumnEditor(this.plugin, wrap as HTMLElement, initial, this.ctx.sourcePath, (val) => {
				this.columnContents[idx] = val;
				this.debouncedSave();
			});
			this.editors.push(editor);
		});
	}

	private saveTimer: number | null = null;
	private debouncedSave() {
		if (this.saveTimer) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.updateSourceInFile();
		}, 800);
	}

	private setupAutoSave() { /* handled by editors' onChange with debounce */ }

	private updateSourceInFile() {
		let newSource = `columns: ${this.config.columns}\n`;
		this.columnContents.forEach((content) => {
			newSource += `===column===\n`;
			if (content) {
				newSource += content;
				if (!content.endsWith('\n')) newSource += '\n';
			}
		});
		newSource = newSource.replace(/\n$/, '');
		this.updateCodeBlockInFile(newSource);
	}

	private updateCodeBlockInFile(newSource: string) {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const content = editor.getValue();

		// Create the new block content
		const newBlock = `\`\`\`multi-column\n${newSource}\n\`\`\``;

		// Find the original code block more reliably by looking for the exact original source
		const originalBlock = `\`\`\`multi-column\n${this.originalSource}\n\`\`\``;

		// Only update if we find the exact original block
		const blockIndex = content.indexOf(originalBlock);
		if (blockIndex !== -1) {
			// Use a small delay to avoid conflicts with live preview
			setTimeout(() => {
				const currentContent = editor.getValue();
				const currentBlockIndex = currentContent.indexOf(originalBlock);

				if (currentBlockIndex !== -1) {
					const newContent = currentContent.substring(0, currentBlockIndex) +
									  newBlock +
									  currentContent.substring(currentBlockIndex + originalBlock.length);

					// Update the original source reference for future saves
					this.originalSource = newSource;

					// Set the new content
					editor.setValue(newContent);
				}
			}, 100);
		}
	}
}
