# QA-харнес (Playwright-скрипты функциональных проверок)

Скрипты, которыми прогонялись все страницы (логин → клики по каждой кнопке →
проверки → уборка за собой в базе). Не тест-фреймворк — обычные node-скрипты.

## Установка (однократно, из этой папки)
```bash
cd scripts/qa
npm install            # ставит playwright из package.json
npx playwright install chromium
```

## Запуск (dev-сервер должен работать на localhost:3000)
```bash
node fin-test.js       # Financials — 21 проверка
node sub-test.js       # Subscription
node roof-test.js      # Roof (нужен стенд: node seed-roof.js up + stub-креды, см. ниже)
node fence-test.js     # Fence
node phone-test.js     # Phone (сначала node seed-phone.js up, после — down)
node messages-test.js  # Messages
node ann-test.js       # Announcements
node reviews-test.js   # Reviews (+ reviews-chips.js)
node trade-test.js     # Trade (+ trade-tail.js)
node ref-test.js       # Referrals (сид конверсий — внутри инструкции сессии)
node reports-test.js   # Reports
node settings-test.js  # Settings
node fixpass-smoke.js  # смоук фикс-пасса (hover/press/фокус/клавиатура)
node shot.js /dashboard /dashboard/leads   # логин + скриншоты любых роутов
```

Примечания:
- Git Bash: запускать с `MSYS_NO_PATHCONV=1`, иначе `/dashboard` превратится в путь Windows.
- seed-*.js `up|down` — сид/уборка тестовых данных (звонки, кэш крыши).
- Роут /dashboard/beige — A/B-копия Overview со старым бежевым видом (удалить папку
  src/app/dashboard/beige, когда сравнение больше не нужно).
