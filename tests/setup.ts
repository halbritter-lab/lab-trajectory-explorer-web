import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

// jsdom does not implement URL.createObjectURL / revokeObjectURL; provide
// no-op stubs so tests that spy on them can work.
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:mock' })
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => {} })
}
