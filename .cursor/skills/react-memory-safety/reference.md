# React Memory Safety — Full Reference

Detailed rules and examples for resource lifecycle and memory leak prevention in React and Next.js.

---

## 1. Never create resources directly in component render

The following resources must never be created directly inside a React component body:

- BroadcastChannel
- WebSocket
- EventSource
- setInterval
- setTimeout
- requestAnimationFrame
- IntersectionObserver
- ResizeObserver
- MutationObserver
- addEventListener
- global caches
- AbortController reused across renders
- singleton instances holding mutable data

Incorrect example:

```tsx
export default function ExampleComponent() {
  const channel = new BroadcastChannel("example");
  return <div />;
}
```

Creating resources during render may lead to duplicated instances or unreleased memory (and in SSR, each request can leak in Node).

---

## 2. Resources must be created inside useEffect or lifecycle hooks

Correct pattern:

```tsx
useEffect(() => {
  const channel = new BroadcastChannel("example");
  return () => {
    channel.close();
  };
}, []);
```

---

## 3. Every side effect must have cleanup logic

Resource → Cleanup:
- BroadcastChannel → channel.close()
- WebSocket → socket.close()
- EventSource → source.close()
- EventListener → removeEventListener
- Timer → clearTimeout / clearInterval
- requestAnimationFrame → cancelAnimationFrame
- IntersectionObserver → disconnect()
- ResizeObserver → disconnect()
- MutationObserver → disconnect()
- Store subscription → unsubscribe()

---

## 4. Observers must always disconnect

Observer APIs hold references to DOM nodes and callbacks. Always disconnect in cleanup.

---

## 5. Event listeners must always be removed

Correct pattern:

```tsx
useEffect(() => {
  window.addEventListener("scroll", handler);
  return () => {
    window.removeEventListener("scroll", handler);
  };
}, []);
```

---

## 6. Timers must always be cleared

```tsx
useEffect(() => {
  const timer = setInterval(fetchData, 1000);
  return () => {
    clearInterval(timer);
  };
}, []);
```

---

## 7. Avoid unbounded caches

Use TTL, LRU, or size limits. Example:

```ts
function setCache(key, value) {
  if (cache.size > 1000) cache.clear();
  cache.set(key, value);
}
```

---

## 8. Avoid storing dynamic data in module-level state

Module-level variables persist for the lifetime of the application (in Node, the process). Store dynamic data in controlled caches with limits.

---

## 9. Avoid resource creation inside loops or render branches

Resources should be managed inside lifecycle hooks, not in map/render branches.

---

## 10. Store subscriptions must unsubscribe

See section 3 and 7 in SKILL.md.

---

## 11. Async tasks must support cancellation

Use a `cancelled` flag (or AbortController) and avoid setState after unmount.

---

## 12. Infinite scroll implementations must clean observers

IntersectionObserver used for infinite scroll must be disconnected on unmount.

---

## 13. Resource ownership rule

The code that creates the resource must also define how it is destroyed.

---

## 14. Avoid hidden global singletons

Singletons must have clear eviction or size limits. In SSR/Node, avoid module-level init that runs on every request and accumulates state.

---

## 15. Memory safety checklist

- No resources created during render
- All timers cleared
- All observers disconnected
- All listeners removed
- All channels closed
- All subscriptions unsubscribed
- No unbounded caches
- No hidden global state growth
- SSR: no browser-only resources created in Node without guards
