import type { ExtensionMessage, ScrapedCreator } from '@tipee/shared'

let composerWindowId: number | undefined
let pendingCreator: ScrapedCreator | null = null

chrome.runtime.onInstalled.addListener(() => {
  console.info('Tipee extension installed')
})

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'OPEN_COMPOSER') {
    pendingCreator = message.creator
    void openComposer()
  }
})

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === composerWindowId) {
    composerWindowId = undefined
    pendingCreator = null
  }
})

async function openComposer(): Promise<void> {
  if (composerWindowId !== undefined) {
    try {
      await chrome.windows.update(composerWindowId, { focused: true })
      return
    } catch {
      composerWindowId = undefined
    }
  }

  const query = pendingCreator ? `?creator=${encodeURIComponent(JSON.stringify(pendingCreator))}` : ''
  const window = await chrome.windows.create({
    url: `${chrome.runtime.getURL('composer.html')}${query}`,
    type: 'popup',
    width: 380,
    height: 620,
    focused: true,
  })
  composerWindowId = window.id
}
