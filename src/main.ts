import {
	App,
	Editor,
	EventRef,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import "@total-typescript/ts-reset";
import "@total-typescript/ts-reset/dom";
import { MySettingManager } from "@/SettingManager";
import { MultiColumnProcessor } from "./processors/MultiColumnProcessor";

interface MultiColumnSettings {
	defaultColumns: number;
	showColumnBorders: boolean;
}

const DEFAULT_SETTINGS: MultiColumnSettings = {
	defaultColumns: 2,
	showColumnBorders: false,
};

export default class MultiColumnPlugin extends Plugin {
	settingManager: MySettingManager;
	private eventRefs: EventRef[] = [];
	private processor: MultiColumnProcessor;

	async onload() {
		this.settingManager = new MySettingManager(this);
		await this.settingManager.loadSettings();

		this.processor = new MultiColumnProcessor(this);

		// Register markdown code block processor for multi-column
		this.registerMarkdownCodeBlockProcessor("multi-column", (source, el, ctx) => {
			this.processor.processCodeBlock(source, el, ctx);
		});

		this.addCommand({
			id: "insert-multi-column-block",
			name: "Insert Multi-Column Block",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const multiColumnBlock = this.generateMultiColumnBlock();
				editor.replaceRange(multiColumnBlock, cursor);
			},
		});

		// Add settings tab
		this.addSettingTab(new MultiColumnSettingTab(this.app, this));

		// Load CSS
		this.loadStyles();
	}

	onunload() {
		super.onunload();
		for (const eventRef of this.eventRefs) {
			this.app.workspace.offref(eventRef);
		}

		this.processor?.cleanup();
	}

	private generateMultiColumnBlock(): string {
		const settings = this.settingManager.getSettings();
		const columns = settings.defaultColumns || 2;

		let block = "```multi-column\n";
		block += `columns: ${columns}\n`;

		// Add empty column placeholders
		for (let i = 0; i < columns; i++) {
			block += "===column===\n";
			block += `Column ${i + 1} content here...\n`;
		}

		block += "```\n";
		return block;
	}

	private loadStyles() {
		// multi-column layout CSS
		const style = document.createElement("style");
		style.textContent = `
			.multi-column-container {
				display: flex;
				flex-direction: column;
				gap: 10px;
				margin: 1em 0;
			}

			.multi-column-controls {
				order: -1;
			}

			.multi-column-content {
				display: flex;
				gap: 20px;
			}

			.multi-column-item {
				flex: 1;
				min-width: 0;
				padding: 8px;
				border-radius: 4px;
				transition: background-color 0.2s;
			}

			.multi-column-item[contenteditable="true"] {
				min-height: 100px;
				border: 1px dashed transparent;
			}

			.multi-column-item[contenteditable="true"]:hover {
				border-color: var(--interactive-accent);
				background: var(--background-primary-alt);
			}

			.multi-column-item[contenteditable="true"]:focus {
				border-color: var(--interactive-accent);
				background: var(--background-primary-alt);
				box-shadow: 0 0 0 2px var(--interactive-accent-alpha);
			}

			.multi-column-item.multi-column-clickable {
				cursor: pointer;
				position: relative;
			}
			.multi-column-item.multi-column-clickable:hover {
				background: var(--background-primary-alt);
			}
			.multi-column-display p { margin: 0 0 0.6em; }
			.multi-column-display p:last-child { margin-bottom: 0; }

			.multi-column-container.show-borders .multi-column-item {
				border: 1px solid var(--background-modifier-border);
				padding: 1em;
			}

			.multi-column-resizer {
				width: 4px;
				background: var(--interactive-accent);
				cursor: col-resize;
				opacity: 0;
				transition: opacity 0.2s;
				border-radius: 2px;
			}

			.multi-column-content:hover .multi-column-resizer {
				opacity: 0.5;
			}

			.multi-column-resizer:hover {
				opacity: 1 !important;
			}

			.multi-column-editor-overlay {
				position: absolute;
				background: var(--background-primary);
				border: 1px solid var(--interactive-accent);
				border-radius: 4px;
				padding: 8px;
				z-index: 1000;
				box-shadow: var(--shadow-l);
			}

			.multi-column-controls button:hover {
				background: var(--interactive-accent-hover) !important;
			}

			.multi-column-controls input:focus {
				outline: 2px solid var(--interactive-accent);
				outline-offset: -2px;
			}
		`;
		document.head.appendChild(style);
	}
}

class MultiColumnSettingTab extends PluginSettingTab {
	plugin: MultiColumnPlugin;

	constructor(app: App, plugin: MultiColumnPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Multi-Column Layout Settings" });

		new Setting(containerEl)
			.setName("Default Columns")
			.setDesc("Default number of columns when creating new multi-column blocks")
			.addSlider((slider) =>
				slider
					.setLimits(1, 6, 1)
					.setValue(this.plugin.settingManager.getSettings().defaultColumns)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settingManager.updateSettings((setting) => {
							setting.value.defaultColumns = value;
						});
					})
			);

		new Setting(containerEl)
			.setName("Show Column Borders")
			.setDesc("Display borders around columns for better visualization")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settingManager.getSettings().showColumnBorders)
					.onChange(async (value) => {
						this.plugin.settingManager.updateSettings((setting) => {
							setting.value.showColumnBorders = value;
						});
					})
			);
	}
}
