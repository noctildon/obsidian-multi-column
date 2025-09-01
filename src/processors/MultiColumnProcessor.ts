import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, MarkdownRenderer } from "obsidian";
import { ColumnEditor } from '../components/ColumnEditor';
import MultiColumnPlugin from "../main";

export class MultiColumnProcessor {
	constructor(private plugin: MultiColumnPlugin) {}

	processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const { config, columnContents } = this.parseConfigAndContent(source);

		// Create a render child to manage the lifecycle and updates
		const renderChild = new MultiColumnRenderChild(el, this.plugin, ctx, config, columnContents, source);
		ctx.addChild(renderChild);
	}

	private parseConfigAndContent(source: string): { config: any; columnContents: string[] } {
        // Parse the codeblock source into config and column contents
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
			} else if (inColumnSection) {
				// Column content
				if (columnContents[currentColumn] === undefined) {
					columnContents[currentColumn] = '';
				}
				columnContents[currentColumn] += line + '\n';
			}
		}

        // Clean up excessive trailing newlines, but preserve intentional ones
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

        // Add/Remove columns
        const editControls = this.createEditControls(container, config);
        container.appendChild(editControls);

		// Create content wrapper for horizontal columns
		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'multi-column-content';

		// Columns placeholder wrappers (editor inserted later)
		for (let i = 0; i < config.columns; i++) {
			const column = document.createElement('div');
			column.className = 'multi-column-item';
			column.setAttribute('data-column', i.toString());
			contentWrapper.appendChild(column);
		}

        // TODO: add the resizer to resize the columns

		container.appendChild(contentWrapper);
		return container;
	}

	private createEditControls(container: HTMLElement, config: any): HTMLElement {
		const controls = document.createElement('div');
		controls.className = 'multi-column-controls';

		// Add column button
		const addBtn = document.createElement('button');
		addBtn.textContent = '+';
		addBtn.title = 'Add column';

		// Remove column button
		const removeBtn = document.createElement('button');
		removeBtn.textContent = '−';
		removeBtn.title = 'Remove column';
		removeBtn.onclick = () => this.removeColumn(container);

		controls.appendChild(addBtn);
		controls.appendChild(removeBtn);

		return controls;
	}

    private addColumn(container: HTMLElement) {
        // TODO: Implement column addition logic
    }

    private removeColumn(container: HTMLElement) {
        // TODO: Implement column removal logic
    }

	cleanup() {
		// Clean up any event listeners or resources
	}
}

class MultiColumnRenderChild extends MarkdownRenderChild {
	private container: HTMLElement;
	private columnContents: string[];
	private originalSource: string;
	private overlayEl: HTMLElement | null = null;
	private overlayEditor: ColumnEditor | null = null;
	private currentEditIndex: number | null = null;
	private currentEditValue: string = '';

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
	}

	private loadColumnContents() {
        // Load and render column contents
        const columns = this.container.querySelectorAll('.multi-column-item');

        columns.forEach((col, idx) => {
			const el = col as HTMLElement;
			const display = document.createElement('div');
			el.innerHTML = '';
			display.className = 'multi-column-display';

            // Render markdown content for nicer preview
			let md = this.columnContents[idx] ?? '';
			if (md.trim()) {
				// Preserve multiple consecutive empty lines by replacing them with HTML breaks
				// This prevents markdown renderer from collapsing them
				md = this.preserveConsecutiveEmptyLines(md);
				MarkdownRenderer.render(this.plugin.app, md, display, this.ctx.sourcePath, this.plugin);
			} else {
				display.textContent = '(empty)';
				display.style.opacity = '0.6';
			}

            el.appendChild(display);
			el.classList.add('multi-column-clickable');
			el.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openEditorOverlay(idx, el);
			});
		});
	}

	private preserveConsecutiveEmptyLines(content: string): string {
		// Replace multiple consecutive empty lines with HTML breaks to prevent
		// markdown renderer from collapsing them
		// Pattern: 2+ consecutive newlines get converted to include HTML breaks
		return content.replace(/\n{3,}/g, (match) => {
			// For n consecutive newlines (n >= 3), replace with 1 newline + (n-2) <br> tags + 1 newline
			const numNewlines = match.length;
			const numBreaks = numNewlines - 2;
			return '\n' + '<br>'.repeat(numBreaks) + '\n';
		});
	}

	private openEditorOverlay(index: number, columnEl: HTMLElement) {
        // Popup overlay window for editing context in a column

		// Avoid reopening if same index already open
		if (this.currentEditIndex === index && this.overlayEl) return;
		this.closeOverlay(false);
		this.currentEditIndex = index;
		this.currentEditValue = this.columnContents[index] ?? '';

		const rect = columnEl.getBoundingClientRect();
		const overlay = document.createElement('div');
		overlay.className = 'multi-column-editor-overlay';
		// Keep dynamic positioning styles inline since they depend on column position
		overlay.style.top = `${rect.top + window.scrollY}px`;
		overlay.style.left = `${rect.left + window.scrollX}px`;
		overlay.style.minWidth = `${Math.max(rect.width, 260)}px`;
		overlay.style.maxWidth = '600px';

		const editorHost = document.createElement('div');
		editorHost.className = 'multi-column-editor-host';
		overlay.appendChild(editorHost);

		const actions = document.createElement('div');
		actions.className = 'multi-column-editor-actions';

		const leftGroup = document.createElement('div');
		leftGroup.className = 'multi-column-editor-actions-group';

		const rightGroup = document.createElement('div');
		rightGroup.className = 'multi-column-editor-actions-group';

		const saveBtn = document.createElement('button');
		saveBtn.textContent = 'Save';
		saveBtn.className = 'mod-cta';
		saveBtn.onclick = () => this.closeOverlay(true);

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Cancel';
		cancelBtn.onclick = () => this.closeOverlay(false);

		leftGroup.appendChild(saveBtn);
		leftGroup.appendChild(cancelBtn);
		actions.appendChild(leftGroup);

		const hint = document.createElement('div');
		hint.className = 'multi-column-editor-hint';
		hint.textContent = 'Esc: cancel · Click outside: save';
		rightGroup.appendChild(hint);
		actions.appendChild(rightGroup);
		overlay.appendChild(actions);

		document.body.appendChild(overlay);
		this.overlayEl = overlay;

		// Instantiate CodeMirror editor (no autosave; just track currentEditValue)
		this.overlayEditor = new ColumnEditor(this.plugin, editorHost, this.currentEditValue, this.ctx.sourcePath, (val) => {
			this.currentEditValue = val; // live update internal buffer only
		});

		// Focus editor
		setTimeout(() => this.overlayEditor?.focus(), 5);

		// Remove event listeners on overlay close (click outside or Esc)
		document.addEventListener('mousedown', this.handleOutsideClick, true);
		document.addEventListener('keydown', this.handleKeyDown, { once: true });

		// Store cleanup references on element for safety
		(overlay as any)._cleanup = () => {
			document.removeEventListener('mousedown', this.handleOutsideClick, true);
			document.removeEventListener('keydown', this.handleKeyDown as any);
		};
	}

	// Event handler: outside click should save and close overlay
	private handleOutsideClick = (e: MouseEvent) => {
		if (!this.overlayEl || !this.overlayEl.contains(e.target as Node)) {
			document.removeEventListener('mousedown', this.handleOutsideClick, true);
			this.closeOverlay(true);
		}
	};

	// Event handler: Escape key cancels edit
	private handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			this.closeOverlay(false);
		}
	};

	private closeOverlay(commit: boolean) {
		if (!this.overlayEl) return;
		if (commit && this.currentEditIndex != null) {
			// Persist change then re-render code block by updating file
			this.columnContents[this.currentEditIndex] = this.currentEditValue;
			this.updateSourceInFile();
		}

        // Destroy editor
		this.overlayEditor?.destroy();
		this.overlayEditor = null;

        // Cleanup handlers
		const cleanup = (this.overlayEl as any)._cleanup;
		if (cleanup) cleanup();
		this.overlayEl.remove();
		this.overlayEl = null;
		this.currentEditIndex = null;
	}

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
