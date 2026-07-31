// Mount a React component inside an imperative blueprint page.
//
// THE PROBLEM THIS SOLVES
//
// The blueprint pages are plain DOM: a `*-content.tsx` renders static markup
// once, and a `*-behavior.ts` fills the dynamic regions and owns every event by
// hand. There is no React tree inside `.content` to render into.
//
// Several things worth having are already built as React components against the
// old design — the roof 2D wireframe and 3D model, the fence Google-Maps draw
// surface, the Smart Proposal clarifying-questions dialog. They are real, they
// work, and they carry non-trivial geometry and state. Rewriting each one as
// imperative DOM would mean maintaining two implementations of the same maths.
//
// So instead of porting them, mount them: a behavior module hands a host node
// and props to `mountIsland`, React owns everything inside that node, and the
// behavior module owns everything outside it. The island's disposer goes in the
// page's teardown list like any other.
//
// WHAT AN ISLAND IS NOT
//
// It is not a way to make a page "half React". Props flow IN only — the island
// reports back through callbacks the behavior module supplies, exactly like a
// DOM event handler would. There is no shared state and no context from the
// page, because the page has no React tree to provide any.

import { createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";

export type Island<P> = {
  /** Re-render with new props. Cheap — React diffs as usual. */
  update(props: P): void;
  /** Unmount and free the root. Idempotent. */
  destroy(): void;
};

/**
 * Render `Comp` into `host` and return a handle.
 *
 * @param host a node the behavior module owns and will not write to again.
 *   React reconciles against its children, so anything else that touches them
 *   will fight it — give the island its own empty element.
 */
export function mountIsland<P extends object>(
  host: HTMLElement,
  Comp: ComponentType<P>,
  props: P,
): Island<P> {
  let root: Root | null = createRoot(host);
  root.render(createElement(Comp, props));

  return {
    update(next: P) {
      root?.render(createElement(Comp, next));
    },
    destroy() {
      const r = root;
      root = null;
      if (!r) return;
      // Deferred: a behavior module's teardown can run from inside React's own
      // commit (the page component unmounting is what triggers it), and
      // unmounting a root synchronously during a render throws
      // "Attempted to synchronously unmount a root while React was already
      // rendering". A microtask puts it safely after the commit.
      queueMicrotask(() => r.unmount());
    },
  };
}
