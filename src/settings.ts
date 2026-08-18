import { App, PluginSettingTab, Setting } from "obsidian";
import FocusGaugePlugin from "./main";

export interface GaugeType {
	label: string;
	name: string;
	color: string;
}

/// <summary>
/// 게이지 문법, Now/Time Blocks 섹션, 줄 내 커서 이동에 쓰는 플러그인 설정입니다.
/// </summary>
export interface FocusGaugeSettings {
	nowHeader: string;
	timeBlocksHeader: string;
	gaugeTypes: GaugeType[];
	syntaxPrefix: string;
	syntaxSuffix: string;
	syntaxSeparator: string;
	autoArchiveTimeBlocks: boolean;
	autoCreateTimeBlock: boolean;
	lineNavChar: string;
}

export const DEFAULT_SETTINGS: FocusGaugeSettings = {
	nowHeader: '## 📊 Now',
	timeBlocksHeader: '## 🕒 Time Blocks',
	gaugeTypes: [
		{ label: 'C', name: 'Concentration', color: '#b388ff' },
		{ label: 'W', name: 'Work', color: '#4dabf7' },
		{ label: 'L', name: 'Learning', color: '#69db7c' },
		{ label: 'R', name: 'Rest', color: '#ffa94d' },
	],
	syntaxPrefix: '[',
	syntaxSuffix: ']',
	syntaxSeparator: ' ',
	autoArchiveTimeBlocks: true,
	autoCreateTimeBlock: true,
	lineNavChar: '[',
}

export class FocusGaugeSettingTab extends PluginSettingTab {
	plugin: FocusGaugePlugin;

	constructor(app: App, plugin: FocusGaugePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h3', { text: 'Time Block Sections' });

		new Setting(containerEl)
			.setName('Now 헤더')
			.setDesc('이전/현재/다음 시간 블록이 표시될 섹션 헤더')
			.addText(text => text
				.setPlaceholder('## 📊 Now')
				.setValue(this.plugin.settings.nowHeader)
				.onChange(async (value) => {
					this.plugin.settings.nowHeader = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Time Blocks 헤더')
			.setDesc('아카이브된 시간 블록이 저장될 섹션 헤더')
			.addText(text => text
				.setPlaceholder('## 🕒 Time Blocks')
				.setValue(this.plugin.settings.timeBlocksHeader)
				.onChange(async (value) => {
					this.plugin.settings.timeBlocksHeader = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('자동 시간 블록 정리')
			.setDesc('파일을 열 때 이전/현재/다음 시간 블록을 Now 섹션으로, 나머지는 Time Blocks로 자동 이동합니다.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoArchiveTimeBlocks)
				.onChange(async (value) => {
					this.plugin.settings.autoArchiveTimeBlocks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('현재 시간 블록 자동 생성')
			.setDesc('현재 시간 블록이 없으면 Now 섹션에 자동으로 생성합니다.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoCreateTimeBlock)
				.onChange(async (value) => {
					this.plugin.settings.autoCreateTimeBlock = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Cursor' });

		new Setting(containerEl)
			.setName('줄 내 이동 문자')
			.setDesc('현재 줄에서 이 문자가 처음 나오는 위치로 커서를 이동합니다. 비우면 명령 실행 후 한 글자를 입력받아 이동합니다.')
			.addText(text => text
				.setPlaceholder('[')
				.setValue(this.plugin.settings.lineNavChar)
				.onChange(async (value) => {
					const char = value.slice(0, 1);
					this.plugin.settings.lineNavChar = char;
					if (value !== char) {
						text.setValue(char);
					}
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Syntax Settings' });

		new Setting(containerEl)
			.setName('시작 문자')
			.setDesc('게이지 패턴의 시작 문자 (예: [, {, <)')
			.addText(text => text
				.setPlaceholder('[')
				.setValue(this.plugin.settings.syntaxPrefix)
				.onChange(async (value) => {
					this.plugin.settings.syntaxPrefix = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		new Setting(containerEl)
			.setName('끝 문자')
			.setDesc('게이지 패턴의 끝 문자 (예: ], }, >)')
			.addText(text => text
				.setPlaceholder(']')
				.setValue(this.plugin.settings.syntaxSuffix)
				.onChange(async (value) => {
					this.plugin.settings.syntaxSuffix = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		new Setting(containerEl)
			.setName('구분자')
			.setDesc('타입과 값 사이의 구분자 (예: 공백, :, -)')
			.addText(text => text
				.setPlaceholder(' ')
				.setValue(this.plugin.settings.syntaxSeparator)
				.onChange(async (value) => {
					this.plugin.settings.syntaxSeparator = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		containerEl.createEl('h3', { text: 'Gauge Types' });

		this.plugin.settings.gaugeTypes.forEach((gaugeType, index) => {
			new Setting(containerEl)
				.setName(`Type: ${gaugeType.label}`)
				.setDesc(gaugeType.name)
				.addText(text => text
					.setPlaceholder('Label (1 char)')
					.setValue(gaugeType.label)
					.onChange(async (value) => {
						if (value.length <= 1 && this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.label = value.toUpperCase();
							await this.plugin.saveSettings();
							this.plugin.refreshExtension();
						}
					}))
				.addText(text => text
					.setPlaceholder('Name')
					.setValue(gaugeType.name)
					.onChange(async (value) => {
						if (this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.name = value;
							await this.plugin.saveSettings();
						}
					}))
				.addColorPicker(color => color
					.setValue(gaugeType.color)
					.onChange(async (value) => {
						if (this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.color = value;
							await this.plugin.saveSettings();
							this.plugin.refreshExtension();
						}
					}))
				.addButton(button => button
					.setButtonText('삭제')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.gaugeTypes.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.refreshExtension();
						this.display();
					}));
		});

		new Setting(containerEl)
			.setName('새 타입 추가')
			.addButton(button => button
				.setButtonText('추가')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.gaugeTypes.push({
						label: 'X',
						name: 'New Type',
						color: '#888888'
					});
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
					this.display();
				}));
	}
}
