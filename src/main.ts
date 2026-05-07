import { Editor, Plugin, Notice, normalizePath, FileSystemAdapter } from 'obsidian'
import kuromoji from 'kuromoji'
import * as path from 'path'

interface YomiNaruSettings {
	mySetting: string
}

const DEFAULT_SETTINGS: YomiNaruSettings = {
	mySetting: 'default'
}

export default class YomiNaru extends Plugin {

	private tokenizer: kuromoji.Tokenizer<kuromoji.IpadicFeatures> | null = null
	private wrappedTokenCount = 0

	settings: YomiNaruSettings
	
	async onload() {
		console.log("Loading YomiNaru")
		await this.loadSettings()
		this.tokenizer = await this.buildTokenizer()
		console.log('YomiNaru tokenizer ready')

		this.addCommand({
			id: 'yn-process-selected',
			name: 'Furiganize Selection',
			hotkeys: [{ modifiers: ['Mod'], key: 'y' }],
			editorCallback: async (editor: Editor) => {
				const selection = editor.getSelection()

				if (!selection) {
					new Notice('YomiNaru: no text selected')
					return
				}

				const processedSelection = await this.processNote(selection)
				editor.replaceSelection(processedSelection)
				new Notice(`YomiNaru processed ${this.wrappedTokenCount} kanji token(s)`)
			}
		})
		this.addCommand({
			id: "yn-process-note",
			name: "Furiganize All",
			hotkeys: [{ modifiers: ['Mod','Shift'], key:'y'}],
			editorCallback: async (editor: Editor) => {
				const note = editor.getValue()
				const processedNote = await this.processNote(note)
				editor.setValue(processedNote)
				new Notice(`YomiNaru processed ${this.wrappedTokenCount} kanji token(s)`)
			}
		})
	}

	async onunload() {
		console.log("Unloading YomiNaru :(")
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.settings)
	}

	private async processNote(note: string): Promise<string> {
		this.wrappedTokenCount = 0
		const chunks = this.splitIntoProcessableChunks(note)
		const processedChunks = await Promise.all(
			chunks.map((chunk) => {
				if (chunk.isRuby) {
					return chunk.text
				}

				return this.processChunk(chunk.text)
			})
		)

		return processedChunks.join('')
	}

	private splitIntoProcessableChunks(note: string): { text: string; isRuby: boolean }[] {
		const rubyPattern = /<ruby>[\s\S]*?<\/ruby>/gi
		const chunks: { text: string; isRuby: boolean }[] = []
		let lastIndex = 0
		let match: RegExpExecArray | null

		while ((match = rubyPattern.exec(note)) !== null) {
			if (match.index > lastIndex) {
				chunks.push(...this.splitPlainTextIntoChunks(note.slice(lastIndex, match.index)))
			}

			chunks.push({ text: match[0], isRuby: true })
			lastIndex = rubyPattern.lastIndex
		}

		if (lastIndex < note.length) {
			chunks.push(...this.splitPlainTextIntoChunks(note.slice(lastIndex)))
		}

		return chunks
	}

	private splitPlainTextIntoChunks(text: string): { text: string; isRuby: boolean }[] {
		return text
			.split(/(\n+|[。！？「」]+)/) // regex for parsing chunks
			.map((chunk) => ({ text: chunk, isRuby: false }))
	}

	private async processChunk(chunk: string): Promise<string> {
		if (!this.containsKanji(chunk)) {
			return chunk
		}

		if (!this.tokenizer) {
			console.warn('YomiNaru tokenizer is not ready')
			return chunk
		}

		const tokens: kuromoji.IpadicFeatures[] = this.tokenizer.tokenize(chunk)
		let result = ''

		tokens.forEach((token) => {
			const surface = token.surface_form
			const reading = token.reading

			if (this.containsKanji(surface) && reading) {
				const hiragana = this.katakanaToHiragana(reading)
				result += this.wordToRuby(surface, hiragana)
				this.wrappedTokenCount += 1
			} else {
				result += surface
			}
		})

		return result
	}

	private async buildTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
		if (!this.manifest.dir) {
			throw new Error('YomiNaru plugin directory is not available')
		}

		if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
			throw new Error('YomiNaru requires a filesystem-based vault adapter')
		}
		const dicVaultPath = normalizePath(`${this.manifest.dir}/dict`)
		const baseDictionaryPath = normalizePath(`${dicVaultPath}/base.dat.gz`)
		const dictionaryExists = await this.app.vault.adapter.exists(baseDictionaryPath)

		if (!dictionaryExists) {
			throw new Error(`YomiNaru dictionary file not found: ${baseDictionaryPath}`)
		}

		const adapter = this.app.vault.adapter as FileSystemAdapter & { getBasePath: () => string }
		const dicPath = path.join(adapter.getBasePath(), dicVaultPath)
		console.log('YomiNaru dictionary path:', dicPath)

		return new Promise((resolve, reject) => {
			kuromoji.builder({ dicPath }).build((error, tokenizer) => {
				if (error) {
					reject(error)
					return
				}

				resolve(tokenizer)
			})
		})
	}

	private katakanaToHiragana(input: string): string {
		return input.replace(/[\u30A1-\u30F6]/g, (char) => {
			return String.fromCharCode(char.charCodeAt(0) - 0x60)
		})
	}

	private wordToRuby(surface: string, reading: string): string {
		const leadingKanaMatch = surface.match(/^[ぁ-ゖァ-ヺー]+/)
		const trailingKanaMatch = surface.match(/[ぁ-ゖァ-ヺー]+$/)

		const leadingKana = leadingKanaMatch?.[0] ?? ''
		const trailingKana = trailingKanaMatch?.[0] ?? ''

		let rubyBase = surface
		let rubyReading = reading

		if (leadingKana && rubyReading.startsWith(this.katakanaToHiragana(leadingKana))) {
			rubyBase = rubyBase.slice(leadingKana.length)
			rubyReading = rubyReading.slice(this.katakanaToHiragana(leadingKana).length)
		}

		if (trailingKana && rubyReading.endsWith(this.katakanaToHiragana(trailingKana))) {
			rubyBase = rubyBase.slice(0, rubyBase.length - trailingKana.length)
			rubyReading = rubyReading.slice(0, rubyReading.length - this.katakanaToHiragana(trailingKana).length)
		}

		if (!rubyBase || !rubyReading || !this.containsKanji(rubyBase)) {
			return surface
		}

		return `${leadingKana}${this.readingToRuby(rubyBase, rubyReading)}${trailingKana}`
	}

	private readingToRuby(kanji: string, reading: string): string {
		return `<ruby>${kanji}<rt>${reading}</rt></ruby>`
	}

	private containsKanji(text: string): boolean {
		return /[\u4E00-\u9FFF]/.test(text)
	}
}