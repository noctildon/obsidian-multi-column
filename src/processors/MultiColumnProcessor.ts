import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView } from "obsidian";
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

		// Create column elements
		for (let i = 0; i < config.columns; i++) {
			const column = document.createElement('div');
			column.className = 'multi-column-item';
			column.setAttribute('data-column', i.toString());

			// Make columns editable if interactive editing is enabled
			if (settings.enableInteractiveEditing) {
				column.contentEditable = 'true';
				column.style.outline = 'none';
				column.style.minHeight = '100px';
				this.attachColumnEvents(column);
			}

			contentWrapper.appendChild(column);

			// Add resizer (except for last column)
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

	attachColumnEvents(column: HTMLElement) {
		// Add placeholder text when empty
		column.addEventListener('focus', () => {
			if (column.textContent?.trim() === 'Click to edit...') {
				column.innerHTML = '';
			}
			column.style.background = 'var(--background-primary-alt)';
		});

		column.addEventListener('blur', () => {
			if (column.textContent?.trim() === '') {
				column.textContent = 'Click to edit...';
				column.style.color = 'var(--text-muted)';
			} else {
				column.style.color = '';
			}
			column.style.background = '';
		});

		// Handle paste events to maintain formatting
		column.addEventListener('paste', (e) => {
			e.preventDefault();
			const text = e.clipboardData?.getData('text/plain') || '';
			// Insert as plain text but preserve line breaks
			const lines = text.split('\n');
			if (lines.length > 1) {
				// For multi-line paste, create div elements
				const html = lines.map(line => `<div>${line || '<br>'}</div>`).join('');
				document.execCommand('insertHTML', false, html);
			} else {
				document.execCommand('insertText', false, text);
			}
		});

		// Handle Enter key for better line break behavior
		column.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				// Let the browser handle Enter naturally to create proper line breaks
				// The browser will create <div> or <br> elements which our htmlToPlainText handles
			}
		});
	}

	private addColumn(container: HTMLElement) {
		const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
		if (!contentWrapper) return;

		const columns = contentWrapper.querySelectorAll('.multi-column-item');
		const settings = this.plugin.settingManager.getSettings();

		// Create new column
		const newColumn = document.createElement('div');
		newColumn.className = 'multi-column-item';
		newColumn.setAttribute('data-column', columns.length.toString());

		if (settings.enableInteractiveEditing) {
			newColumn.contentEditable = 'true';
			newColumn.style.outline = 'none';
			newColumn.style.minHeight = '100px';
			newColumn.textContent = 'Click to edit...';
			newColumn.style.color = 'var(--text-muted)';
			this.attachColumnEvents(newColumn);
		}

		// Add resizer before the new column
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
		const columnElements = this.container.querySelectorAll('.multi-column-item');

		columnElements.forEach((column, index) => {
			const htmlColumn = column as HTMLElement;
			const content = this.columnContents[index] || '';

			if (content && content.trim() !== '') {
				// If interactive editing is enabled, convert markdown to HTML for editing
				const settings = this.plugin.settingManager.getSettings();
				if (settings.enableInteractiveEditing && htmlColumn.contentEditable === 'true') {
					htmlColumn.innerHTML = this.markdownToHtml(content);
				} else {
					// For non-editable content, render as markdown
					htmlColumn.innerHTML = this.markdownToHtml(content);
				}
			} else {
				const settings = this.plugin.settingManager.getSettings();
				if (settings.enableInteractiveEditing) {
					htmlColumn.textContent = 'Click to edit...';
					htmlColumn.style.color = 'var(--text-muted)';
				}
			}
		});
	}

	private markdownToHtml(markdown: string): string {
		// Split into lines first to properly handle empty lines
		const lines = markdown.split('\n');

		const htmlLines = lines.map(line => {
			// Handle empty lines
			if (line.trim() === '') {
				return '<div><br></div>'; // Empty div with br to maintain spacing
			}

			// Process markdown formatting for non-empty lines
			let processedLine = line
				.replace(/^### (.*$)/gim, '<h3>$1</h3>')
				.replace(/^## (.*$)/gim, '<h2>$1</h2>')
				.replace(/^# (.*$)/gim, '<h1>$1</h1>')
				.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
				.replace(/\*(.*?)\*/g, '<em>$1</em>');

			return `<div>${processedLine}</div>`;
		});

		return htmlLines.join('');
	}

	private setupAutoSave() {
		const columnElements = this.container.querySelectorAll('.multi-column-item');

		columnElements.forEach((column, index) => {
			const htmlColumn = column as HTMLElement;

			if (htmlColumn.contentEditable === 'true') {
				// Save on blur
				htmlColumn.addEventListener('blur', () => {
					this.saveColumnContent(index, htmlColumn);
				});

				// Auto-save after typing stops
				let saveTimeout: NodeJS.Timeout;
				htmlColumn.addEventListener('input', () => {
					clearTimeout(saveTimeout);
					saveTimeout = setTimeout(() => {
						this.saveColumnContent(index, htmlColumn);
					}, 1000); // Save 1 second after typing stops
				});
			}
		});
	}

	private saveColumnContent(columnIndex: number, columnElement: HTMLElement) {
		// Convert HTML content back to plain text with preserved newlines
		const content = this.htmlToPlainText(columnElement.innerHTML);

		// Don't save placeholder text
		if (content === 'Click to edit...' || content.trim() === '') {
			this.columnContents[columnIndex] = '';
		} else {
			this.columnContents[columnIndex] = content;
		}

		// Update the source in the file
		this.updateSourceInFile();
	}

	private htmlToPlainText(html: string): string {
		// Create a temporary element to parse the HTML
		const temp = document.createElement('div');
		temp.innerHTML = html;

		// Convert various HTML elements to plain text with newlines
		const text = this.convertElementToText(temp);

		// Clean up excessive trailing newlines, but preserve intentional empty lines
		// Remove trailing newlines only at the very end
		return text.replace(/\n+$/, '');
	}

	private convertElementToText(element: Element): string {
		let text = '';

		for (const node of Array.from(element.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				text += node.textContent || '';
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const elem = node as Element;
				const tagName = elem.tagName.toLowerCase();

				// Handle div elements (our main line containers)
				if (tagName === 'div') {
					// Check if this is an empty div (represents empty line)
					const divText = this.convertElementToText(elem);
					if (divText.trim() === '' || divText === '\n') {
						// Empty div represents an empty line
						text += '\n';
					} else {
						// Non-empty div with content
						if (text && !text.endsWith('\n')) {
							text += '\n';
						}
						text += divText;
						text += '\n';
					}
				}
				// Handle other block elements
				else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
					if (text && !text.endsWith('\n')) {
						text += '\n';
					}
					text += this.convertElementToText(elem);
					text += '\n';
				}
				// Handle br tags (but only if not inside a div we already processed)
				else if (tagName === 'br') {
					// Only add newline if we're not already processing it as part of an empty div
					const parent = elem.parentElement;
					if (!parent || parent.tagName.toLowerCase() !== 'div' || parent.childNodes.length > 1) {
						text += '\n';
					}
				}
				// Handle other inline elements
				else {
					text += this.convertElementToText(elem);
				}
			}
		}

		return text;
	}	private updateSourceInFile() {
		// Create the new source with updated content
		let newSource = `columns: ${this.config.columns}\n`;

		// Add column content
		this.columnContents.forEach((content, index) => {
			newSource += `===column===\n`;
			if (content) {
				newSource += content;
				// Only add trailing newline if content doesn't already end with one
				if (!content.endsWith('\n')) {
					newSource += '\n';
				}
			}
		});

		// Remove any trailing newline from the entire source
		newSource = newSource.replace(/\n$/, '');

		// Try to update the source in the file
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
