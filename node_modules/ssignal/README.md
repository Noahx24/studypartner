# SSignal

[![npm version](https://img.shields.io/npm/v/ssignal.svg)](https://www.npmjs.com/package/ssignal)
[![npm downloads](https://img.shields.io/npm/dm/ssignal.svg)](https://www.npmjs.com/package/ssignal)
[![bundle size](https://img.shields.io/bundlephobia/minzip/ssignal)](https://bundlephobia.com/package/ssignal)
[![License: MIT](https://img.shields.io/npm/l/ssignal)](LICENSE)
[![Node.js](https://img.shields.io/node/v/ssignal)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![GitHub stars](https://img.shields.io/github/stars/ElJijuna/ssignal)](https://github.com/ElJijuna/ssignal/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/ElJijuna/ssignal)](https://github.com/ElJijuna/ssignal/issues)

A lightweight, zero-dependency reactive signal built on top of the native `EventTarget` API. `SSignal` lets you observe value changes on any data type — including deep mutations on `Map` instances — without a framework, build plugin, or compiler transform.

## Features

- **Simple API** — `value`, `subscribe`, and an unsubscribe function. That's it.
- **Framework-agnostic** — works in the browser, Node.js ≥ 18.7, and any runtime that supports `EventTarget`.
- **Reactive `Map` support** — mutations via `set()`, `delete()`, and `clear()` automatically dispatch change events.
- **Updater functions** — `signal.value = (prev) => prev + 1` for safe derived updates.
- **Immediate mode** — `{ immediate: true }` fires the callback with the current value on subscribe.
- **One-time subscriptions** — `once()` listens for the next change only, then unsubscribes itself.
- **Computed signals** — derive read-only signals from one or more sources with `computed()`.
- **AbortSignal integration** — cancel subscriptions with a standard `AbortController`.
- **TypeScript-first** — fully typed, zero `any` in the public API.
- **Tree-shakeable** — `sideEffects: false`, ships ESM + CJS + UMD.

## Installation

```sh
npm install ssignal
```

### CDN (browser)

```html
<script src="https://unpkg.com/ssignal@latest/lib/ssignal.umd.js"></script>
```

## API

| Member | Description |
| :----- | :---------- |
| `new SSignal(value: T)` | Creates a signal. `Map` values are automatically wrapped in a reactive proxy. |
| `signal.value` | Gets the current value. |
| `signal.value = newValue \| (prev: T) => T` | Sets a new value. Accepts a direct value or an updater function. No event is fired when the value does not change. |
| `signal.subscribe(callback, options?)` | Registers a listener called on every change. Returns an unsubscribe function. Options: `{ signal?: AbortSignal, immediate?: boolean }`. |
| `signal.once(callback, options?)` | Registers a listener called only on the next change, then unsubscribes automatically. Returns an unsubscribe function. Options: `{ signal?: AbortSignal }`. |
| `computed(source, fn)` | Creates a read-only `ComputedSignal` derived from one source. |
| `computed([...sources], fn)` | Creates a read-only `ComputedSignal` derived from multiple sources. |
| `computed.dispose()` | Removes all source subscriptions. Call when the signal is no longer needed. |

### Events

| Event | Type | Description |
| :---- | :--- | :---------- |
| `change` | `CustomEvent<T>` | Fired when the value changes. The new value is available as `event.detail`. |

## Usage examples

### Plain function / vanilla JS

```ts
import SSignal from 'ssignal';

const counter = new SSignal(0);

const unsubscribe = counter.subscribe((value) => {
  console.log('counter changed:', value);
});

counter.value = 1;              // logs: counter changed: 1
counter.value = (n) => n + 1;  // logs: counter changed: 2
counter.value = 2;              // no log — same value, no event fired

unsubscribe();
counter.value = 99;             // no log — already unsubscribed
```

### React component

```tsx
import { useEffect, useState } from 'react';
import SSignal from 'ssignal';

// Create signals outside the component so they are shared across the app
export const themeSignal = new SSignal<'light' | 'dark'>('light');
export const cartSignal = new SSignal(new Map<string, number>());

// Generic hook to bind any SSignal to local state
function useSignal<T>(signal: SSignal<T>): T {
  const [value, setValue] = useState<T>(signal.value);

  useEffect(() => {
    const controller = new AbortController();
    // immediate: true keeps state in sync if the signal changes between
    // render and the effect running
    signal.subscribe((v) => setValue(v), { signal: controller.signal, immediate: true });
    return () => controller.abort();
  }, [signal]);

  return value;
}

export function ThemeToggle() {
  const theme = useSignal(themeSignal);

  return (
    <button onClick={() => themeSignal.value = theme === 'light' ? 'dark' : 'light'}>
      Current theme: {theme}
    </button>
  );
}

export function Cart() {
  const cart = useSignal(cartSignal);

  const addItem = (id: string) => {
    cartSignal.value.set(id, (cart.get(id) ?? 0) + 1);
  };

  return (
    <div>
      <p>Items in cart: {cart.size}</p>
      <button onClick={() => addItem('product-1')}>Add product</button>
    </div>
  );
}
```

### Express backend

```ts
import express from 'express';
import SSignal from 'ssignal';

const app = express();

// Shared application state
const connectedClients = new SSignal(0);
const featureFlags = new SSignal(new Map<string, boolean>([
  ['new-checkout', false],
  ['dark-mode', true],
]));

// Log every time the client count changes
connectedClients.subscribe((count) => {
  console.log(`[${new Date().toISOString()}] Connected clients: ${count}`);
});

app.use((req, res, next) => {
  connectedClients.value = (n) => n + 1;
  res.on('finish', () => {
    connectedClients.value = (n) => n - 1;
  });
  next();
});

app.get('/flags', (req, res) => {
  res.json(Object.fromEntries(featureFlags.value));
});

app.patch('/flags/:name', express.json(), (req, res) => {
  const { name } = req.params;
  featureFlags.value.set(name, req.body.enabled);
  res.sendStatus(204);
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

### Reactive Map

```ts
import SSignal from 'ssignal';

const store = new SSignal(new Map<string, number>());

store.subscribe((map) => {
  console.log('store changed, size:', map.size);
});

store.value.set('a', 1);    // logs: store changed, size: 1
store.value.set('b', 2);    // logs: store changed, size: 2
store.value.delete('a');    // logs: store changed, size: 1
store.value.clear();        // logs: store changed, size: 0
```

### Immediate mode

```ts
import SSignal from 'ssignal';

const user = new SSignal({ name: 'Ivan' });

// Fires immediately with current value, then on every change
user.subscribe((v) => console.log('user:', v.name), { immediate: true });
// logs: user: Ivan  ← fired synchronously on subscribe

user.value = { name: 'Junior' };
// logs: user: Junior
```

### One-time subscription

```ts
import SSignal from 'ssignal';

type CheckoutState =
  | { status: 'idle' }
  | { status: 'processing'; orderId: string }
  | { status: 'paid'; orderId: string; receiptUrl: string }
  | { status: 'failed'; orderId: string; reason: string };

const checkout = new SSignal<CheckoutState>({ status: 'idle' });

function openCheckout(orderId: string) {
  const controller = new AbortController();

  checkout.once((state) => {
    if (state.status === 'paid') {
      window.location.assign(state.receiptUrl);
    }
  }, { signal: controller.signal });

  checkout.value = { status: 'processing', orderId };

  return {
    close: () => controller.abort(),
  };
}

const modal = openCheckout('order_123');

checkout.value = {
  status: 'paid',
  orderId: 'order_123',
  receiptUrl: '/receipts/order_123',
}; // redirects once

modal.close(); // no effect after the one-time listener has already fired
```

### Computed signals

```ts
import SSignal, { computed } from 'ssignal';

// Single source
const price = new SSignal(100);
const withTax = computed(price, (p) => p * 1.21);

withTax.subscribe((v) => console.log('price with tax:', v));
// logs: price with tax: 121

price.value = 200;
// logs: price with tax: 242

// Multiple sources
const qty = new SSignal(3);
const total = computed([price, qty], ([p, q]) => p * q);

total.subscribe((v) => console.log('total:', v)); // logs: total: 600
qty.value = 5; // logs: total: 1000

// computed signals are read-only
total.value = 0; // throws TypeError

// clean up when no longer needed
total.dispose();
```

### AbortController

```ts
import SSignal from 'ssignal';

const signal = new SSignal(0);
const controller = new AbortController();

signal.subscribe((v) => console.log(v), { signal: controller.signal });

signal.value = 1;    // logs: 1
controller.abort();
signal.value = 2;    // no log
```

## Scripts

| Command | Description |
| :------ | :---------- |
| `npm run build` | Compile and bundle to `lib/`. |
| `npm test` | Run the test suite. |
| `npm run test:coverage` | Run tests with coverage report. |

## Performance

`SSignal` handles **200,000 value updates** notifying **10 simultaneous subscribers** in under 500 ms.

![Performance test report](images/test-report.png)

## License

MIT — see [LICENSE](LICENSE).

---

Repository: [github.com/ElJijuna/ssignal](https://github.com/ElJijuna/ssignal)
