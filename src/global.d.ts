import type { EasySpendsApi } from '../electron/preload'

declare global {
  interface Window {
    easySpends: EasySpendsApi
  }
}

export {}
