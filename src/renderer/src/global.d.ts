import type { ZackApi } from '../../preload'

declare global {
  interface Window {
    api: ZackApi
  }
}

export {}
