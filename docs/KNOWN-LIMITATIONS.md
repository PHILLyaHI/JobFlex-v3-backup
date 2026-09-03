# Known limitations

## Classic-shell settings subpages (deferred port)

`/dashboard/settings/{team, email, proposals, leads, theme, ai, preferences, company}`
still render in the CLASSIC (dashboard) shell. They are ported to the blueprint
shell **as needed, not now** (owner call, 2026-09-03, after the button audit).

- **Функционально работают** — все формы и действия исправны.
- **Hydration-шум консольный**: каждая страница логирует один hydration
  mismatch на загрузке. Корень не в страницах — сырой SSR-HTML корректен
  (проверено), расхождение возникает на уровне классического шелла /
  Next-стриминга — **лечится только портом ветки на blueprint-шелл**,
  не точечной правкой.
- Топбар классического шелла: кнопка Search не открывает палитру (в
  blueprint-шелле ⌘K работает).

Шесть бывших соседей (`account`, `billing`, `payment`, `integrations`,
`gmail`, `meta`) уже superseded: их URL редиректят в панели blueprint-хаба
`/dashboard/settings?pane=…`; старые страницы заархивированы в
`old-design-pages/dashboard/settings/`.
