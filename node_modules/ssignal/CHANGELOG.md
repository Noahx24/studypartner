# [1.6.0](https://github.com/ElJijuna/ssignal/compare/v1.5.0...v1.6.0) (2026-05-04)


### Features

* add reactive Set support (closes [#27](https://github.com/ElJijuna/ssignal/issues/27)) ([9d8183a](https://github.com/ElJijuna/ssignal/commit/9d8183a3a21ed7e7003b0f7afca5724c25602ed0))

# [1.4.0](https://github.com/ElJijuna/ssignal/compare/v1.3.0...v1.4.0) (2026-05-03)


### Features

* add computed() derived read-only signal (closes [#21](https://github.com/ElJijuna/ssignal/issues/21)) ([f493460](https://github.com/ElJijuna/ssignal/commit/f4934603c26f92e56ee32d49c805f52819d3d1bd))
* add immediate option to subscribe (closes [#20](https://github.com/ElJijuna/ssignal/issues/20)) ([f6210a7](https://github.com/ElJijuna/ssignal/commit/f6210a712eb636d5a230a84b7cef663bb4e229e5))
* move types condition before import/require in exports map ([c65c903](https://github.com/ElJijuna/ssignal/commit/c65c9034952af7d76c96a7a238afa08300b8303d))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From v1.4.0 onwards this file is maintained automatically by [semantic-release](https://github.com/semantic-release/semantic-release).

## [Unreleased]

### Added
- `immediate` option in `subscribe()` — fires callback synchronously with the current value on registration.
- CI workflow running tests, type check, and build on PRs across Node.js 18, 20, and 22.
- Automated release pipeline with semantic-release: publishes to npm, generates changelog, and opens a release PR on every push to `main`.

### Fixed
- `src/index.ts` re-exported with `export { default }` instead of `export *` — default export was not forwarded to consumers.
- `set value` setter now correctly typed as `T | ((prev: T) => T)`, eliminating the need for `as any` casts.
- `subscribe` no longer adds and immediately removes a listener when called with a pre-aborted `AbortSignal`.
- `vite.config.ts` output changed from `exports: 'named'` to `exports: 'default'` — CJS consumers received `{ default: SSignal }` instead of the constructor.
- `engines.node` corrected to `>=18.7.0` (`CustomEvent` is unavailable before that version).

### Changed
- Build and TypeScript targets aligned to `ES2022` to preserve native private class fields.
- `tsconfig.json` `moduleResolution` updated from deprecated `node` to `bundler`.
- Private method `#Map` renamed to `#wrapMap` to avoid confusion with the global `Map` constructor.
- `subscribe` AbortSignal cleanup simplified using `{ once: true }`.
- `#wrapMap` Proxy handler migrated to arrow functions, removing the `const self = this` workaround.
- JSDoc comments added in English for all public API members.

## [1.3.0] - 2025-10-02

### Added
- AbortController / AbortSignal support in `subscribe()`. Passing `{ signal: AbortSignal }` automatically cancels the subscription when the controller is aborted. If the signal is already aborted at call time, the callback is never registered.

## [1.2.1] - 2025-10-01

### Changed
- README expanded with usage examples and API reference.
- Cleaned up `package.json` exports and metadata.

## [1.2.0] - 2025-10-01

### Changed
- Build toolchain migrated from `tsc` to **Vite**. Output now ships ESM, CJS, and UMD bundles under `lib/`.
- `package.json` updated with `main`, `module`, `types`, and `exports` fields pointing to the new build output.

## [1.1.0] - 2025-10-01

### Added
- Reactive `Map` support. Initializing `SSignal` with a `Map` wraps it in a `Proxy` that automatically dispatches `change` events when `set()`, `delete()`, or `clear()` are called. All read methods (`get`, `has`, `entries`, `keys`, `values`, `forEach`, `size`) continue to work transparently.

## [1.0.2] - 2025-10-01

### Added
- `subscribe()` now returns an unsubscribe function — calling it removes the listener.
- Performance test suite: verifies 200,000 value updates with 10 simultaneous subscribers complete in under 500 ms.
- Jest HTML reporter and slow-test reporter configured.

### Changed
- Value setter uses `Object.is` for equality check — no event is dispatched when the new value is strictly equal to the current one.

## [1.0.0] - 2025-09-30

### Added
- Initial release.
- `SSignal<T>` class extending `EventTarget` with `value` getter/setter and `subscribe(callback)` method.
- Dispatches a `CustomEvent<T>` named `change` on every value update.
- Full TypeScript support with generics.

[Unreleased]: https://github.com/ElJijuna/ssignal/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/ElJijuna/ssignal/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/ElJijuna/ssignal/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/ElJijuna/ssignal/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ElJijuna/ssignal/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/ElJijuna/ssignal/compare/v1.0.0...v1.0.2
[1.0.0]: https://github.com/ElJijuna/ssignal/releases/tag/v1.0.0
