# Blueprint implementation notes

[DESIGN.md](../../DESIGN.md) is the only visual specification. These notes
preserve implementation lessons without carrying an older theme forward.

- Identify whether the target is React or an imperative `*-content.tsx` /
  `*-behavior.ts` page. Inspect both markup and event ownership before editing.
  Do not assume all Blueprint pages use the same renderer.
- Reuse `src/components/v3/blueprint-shell/nav-map.ts` for navigation and the
  existing responsive shell. Do not copy a prototype's sidebar or zoom module.
- Reuse `src/lib/scrollLock.ts` for nested scroll locks. Saving and restoring
  `document.body.style.overflow` independently can leave the whole page locked.
- For existing imperative `.mdl` dialogs use `blueprint-shell/mdl-motion`
  (`openMdl`, `closeMdl`, `MDL_EXIT_MS`). Let exit motion finish before clearing
  fields. Use the existing in-house React sheet pattern for React surfaces.
- Use `blueprint-shell/list-motion` where that page already supports row
  transitions. Do not replay a full-list stagger on filter, input, selection
  or deletion. Never animate a hidden subtree and depend on `transitionend`
  to make it usable. Content must remain visible without entrance effects.
- Patch a changed node in imperative pages instead of replacing the entire
  container's `innerHTML`, which loses focus and replays entrance effects.
  Preserve stable keys and local input state in React lists.
- For layouts inside the existing zoomed shell, use the closest
  `.jf-blueprint` root's actual zoom when converting measured geometry.
  Do not read a document-wide zoom or add a second scaling system.
- Avoid doubled borders where framed blocks touch. Preserve semantic status
  stripes when changing hover borders; shorthand can erase their color.
- Do not sort a list by state that merely reading it changes (such as unread
  status). Preserve user placement decisions across previews and committed
  renders; validate both sides when swapping occupied positions.
- Reuse the target surface's established select/date controls. The imperative
  shell has `.bp-sel` / `.bp-sel-in`; React surfaces can retain accessible
  native controls. Do not import an imperative wrapper without its styles or
  introduce a custom picker solely for decoration.
- Mount existing React viewers inside imperative pages using
  `blueprint-shell/react-island` and an empty host the behavior module does not
  rewrite. Pair every mount with `destroy()`. Keep WebGL container geometry
  valid while switching views.
- Read live authentication and server state before testing. Do not assume
  an old missing-login report still applies. A redirect does not prove the
  protected page compiled, rendered or works. Use the current authorized QA
  workflow; do not seed a database or spend paid lookup credits implicitly.
