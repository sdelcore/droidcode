// Safe ID helper. `crypto.randomUUID` is unavailable in insecure-context
// browsers (plain-HTTP origins like http://nightman:5173) even on desktop
// Chrome / Firefox recent versions, and on older mobile WebKit.

export function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return (
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Date.now().toString(36)
  )
}
