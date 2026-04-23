---
name: react-memory-safety
description: Apply whenever generating React or Next.js components, hooks, or code with side effects. Ensures all generated code follows memory-safe lifecycle patterns by default—resources in useEffect with cleanup, no creation during render, bounded caches. Use for any component/hook implementation, code review, or memory leak analysis.
alwaysApply: true
---

# React Memory Safety

**默认要求**：在本项目中，凡是生成 React/Next.js 组件、自定义 Hook、或任何涉及副作用/资源的代码时，都必须遵循本规范，主动避免内存泄漏。无需用户单独提及「内存」才应用。

Best practices for managing resources in React and Next.js. Applies to React, Next.js App Router, React Query, Zustand, and browser/Node APIs.

The AI must generate code that **always follows safe lifecycle patterns**:

- Resources are created inside lifecycle hooks (e.g., useEffect)
- Cleanup functions are provided for all subscriptions, observers, timers, channels, and async tasks
- No resources are created directly during render
- Caches and global state are bounded and do not grow indefinitely

---

## Core Principle

Any resource that allocates memory or attaches listeners must:

1. Be created in a lifecycle-safe location (e.g., useEffect)
2. Include a cleanup function that properly releases the resource
3. Never be created directly during render
4. Follow clear ownership: the creator is responsible for destruction

---

## 1. Never create resources directly in component render

The following must **never** be created inside a React component body:

- BroadcastChannel
- WebSocket
- EventSource
- setInterval / setTimeout
- requestAnimationFrame
- IntersectionObserver / ResizeObserver / MutationObserver
- addEventListener
- global caches
- AbortController reused across renders
- singleton instances holding mutable data

**Incorrect:**

```tsx
export default function ExampleComponent() {
  const channel = new BroadcastChannel("example");
  return <div />;
}
```

**Correct:** Create in useEffect and clean up in the return function (see section 2).

---

## 2. Resources must be created inside useEffect (or lifecycle hooks)

**Correct pattern:**

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

| Resource | Cleanup |
|----------|---------|
| BroadcastChannel | `channel.close()` |
| WebSocket | `socket.close()` |
| EventSource | `source.close()` |
| EventListener | `removeEventListener` |
| Timer | `clearTimeout` / `clearInterval` |
| requestAnimationFrame | `cancelAnimationFrame` |
| IntersectionObserver | `disconnect()` |
| ResizeObserver | `disconnect()` |
| MutationObserver | `disconnect()` |
| Store subscription | `unsubscribe()` |

**Example:**

```tsx
useEffect(() => {
  const handler = () => {};
  window.addEventListener("scroll", handler);
  return () => {
    window.removeEventListener("scroll", handler);
  };
}, []);
```

---

## 4. Observers must always disconnect

```tsx
useEffect(() => {
  const observer = new IntersectionObserver(callback);
  observer.observe(target);
  return () => {
    observer.disconnect();
  };
}, []);
```

---

## 5. Async tasks must support cancellation

Guard against state updates after unmount:

```tsx
useEffect(() => {
  let cancelled = false;
  async function load() {
    const data = await fetchData();
    if (!cancelled) setState(data);
  }
  load();
  return () => { cancelled = true; };
}, []);
```

---

## 6. Avoid unbounded caches and module-level mutable state

- Caches: use TTL, LRU, or a size limit.
- Do not store request-scoped or dynamic data in module-level variables (especially in Node/SSR).

---

## 7. Store subscriptions must unsubscribe

```tsx
useEffect(() => {
  const unsubscribe = store.subscribe(listener);
  return () => unsubscribe();
}, []);
```

---

## 8. Safe lifecycle template

```tsx
useEffect(() => {
  const resource = createResource();
  return () => {
    destroyResource(resource);
  };
}, []);
```

---

## Memory safety checklist

Before generating or reviewing code, verify:

- [ ] No resources created during render
- [ ] All timers cleared
- [ ] All observers disconnected
- [ ] All listeners removed
- [ ] All channels closed
- [ ] All subscriptions unsubscribed
- [ ] No unbounded caches
- [ ] No hidden global state growth
- [ ] SSR: no browser-only resources (e.g. BroadcastChannel) created in Node without `typeof window` guard

---

## Reference

Full rules and anti-patterns: [reference.md](reference.md)
