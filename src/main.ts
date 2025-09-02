import {
	App,
	Editor,
	EventRef,
	MarkdownView,
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
	buttonSize: number; // 0.5 to 2.0 scale factor
}

const DEFAULT_SETTINGS: MultiColumnSettings = {
	defaultColumns: 2,
	showColumnBorders: false,
	buttonSize: 1.0, // 1.0 = normal size
};

export default class MultiColumnPlugin extends Plugin {
	settingManager: MySettingManager;
	private eventRefs: EventRef[] = [];
	private processor: MultiColumnProcessor;
	// Interval id used to log cursor position every second while the plugin is loaded
	private cursorLoggerInterval: number | null = null;

	async onload() {
		this.settingManager = new MySettingManager(this);
		await this.settingManager.loadSettings();

		this.processor = new MultiColumnProcessor(this);

		// Register markdown codeblock processor for multi-column
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

		this.addSettingTab(new MultiColumnSettingTab(this.app, this));

        // DEBUG: Log cursor position
		// Start logging the cursor position every 1 second while the plugin is active
		this.cursorLoggerInterval = window.setInterval(() => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view) {
				const cursor = view.editor.getCursor();
				// console.log(`Cursor position: line=${cursor.line}, ch=${cursor.ch}`);
			} else {
				// console.log("No active Markdown view");
			}
		}, 1000);
	}

	onunload() {
		super.onunload();
		for (const eventRef of this.eventRefs) {
			this.app.workspace.offref(eventRef);
		}

		this.processor?.cleanup();
	}

    // Generate new multi-column codeblock
	private generateMultiColumnBlock(): string {
		const settings = this.settingManager.getSettings();
		const columns = settings.defaultColumns || 2;

		let block = "```multi-column\n";
		block += `columns: ${columns}\n`;
        block += `columnWidths: 50.0,50.0\n`;

		for (let i = 0; i < columns; i++) {
			block += "===column===\n";
			block += `Column ${i + 1} content here...\n`;
		}

		block += "```\n";
		return block;
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

		new Setting(containerEl)
			.setName("Button Size")
			.setDesc("Control the size of column add/delete buttons (0.5 = very small, 1.0 = normal, 2.0 = very large)")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 2.0, 0.1)
					.setValue(this.plugin.settingManager.getSettings().buttonSize)
					.setDynamicTooltip()
					.onChange(async (value: number) => {
						this.plugin.settingManager.updateSettings((setting) => {
							setting.value.buttonSize = value;
						});
					})
			);
	}
}
