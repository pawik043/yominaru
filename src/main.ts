import { Editor, Plugin, Notice } from 'obsidian'

export default class YomiNaru extends Plugin {
	async onload() {
		console.log("Loading YomiNaru")
		this.addCommand({
			id: "yn-process-note",
			name: "Kanjify",
			hotkeys: [{ modifiers: ['Mod'], key:'y'}],
			editorCallback: async (editor: Editor) => {
				const note = editor.getValue()
				const processedNote = await this.processNote(note)
				editor.setValue(processedNote)
				new Notice('YomiNaru processed the current note')
			}
		})
	}

	async onunload() {
		console.log("Unloading YomiNaru :(")
	}

	private async processNote(note: string): Promise<string> {
		const chunks = this.splitIntoChunks(note)
		const processedChunks = await Promise.all(
			chunks.map((chunk) => this.processChunk(chunk))
		)

		return processedChunks.join('')
	}

	private splitIntoChunks(note: string): string[] {
		return note.split(/(\n+)/)
	}

	private async processChunk(chunk: string): Promise<string> {
		if (!this.containsKanji(chunk)) {
			return chunk
		}

		// MVP pipeline placeholder:
		// 1. Send this chunk to the tokenizer.
		// 2. Read token surface forms and readings.
		// 3. Convert katakana readings to hiragana.
		// 4. Wrap kanji-containing tokens in ruby formatting.
		// 5. Return the rebuilt chunk.
		return chunk
	}

	private containsKanji(text: string): boolean {
		return /[\u4E00-\u9FFF]/.test(text)
	}
}