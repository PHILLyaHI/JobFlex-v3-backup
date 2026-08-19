# Локальная среда JobFlex v3

Как поднять рабочую локалку с нуля. Секреты сюда не вписывать — только в `.env.local` (он в `.gitignore`).

## Быстрый старт

```bash
# 1. Зависимости
npm install

# 2. Переменные окружения из Vercel (проект jobflex-v3 @ phillyahis-projects)
npx vercel login                 # однократно
npx vercel link --yes --scope phillyahis-projects --project jobflex-v3
npx vercel env pull .env.local --environment=development --yes

# 3. База — SQLite, файл prisma/dev.db (DATABASE_URL из Vercel dev уже `file:`)
npx prisma generate
npx prisma db push               # схема ↔ база
npm run seed                     # ⚠️ ТОЛЬКО на чистую базу: сид без guard'а,
                                 # повторный запуск создаст дубли демо-данных

# 4. Запуск
npm run dev                      # http://localhost:3000
```

Демо-логин: `owner@acme.test` / `password123` (также `sales@` и `installer@`, тот же пароль).

## База данных

- Провайдер жёстко `sqlite` (`prisma/schema.prisma`), файл `prisma/dev.db`. Docker/Postgres **не нужен** — dev-окружение Vercel само использует файловый URL.
- `DIRECT_URL` пуст — для SQLite не требуется.
- Перед `prisma generate` останови dev-сервер: на Windows он держит DLL движка (EPERM при перезаписи).

## ТРЕБУЮТ РУЧНОГО ВВОДА (sensitive из Vercel приходят пустыми)

Заполняй по мере надобности — каждая фича честно деградирует без своего ключа.

| Переменная | Где взять | Что включает |
|---|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys | Smart Proposal, OCR чеков, AI-сметы (без него — шаблонные фолбэки) |
| `EAGLEVIEW_CLIENT_ID` / `EAGLEVIEW_CLIENT_SECRET` | developer.eagleview.com (sandbox) | Roof estimator целиком |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console → Maps Platform (server key) | геокодинг, Find в Fence |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | там же (browser key, с HTTP-referrer localhost) | спутниковая карта Fence, Places autocomplete |
| `REGRID_API_KEY` | regrid.com (free trial) | контур участка в Fence |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | console.twilio.com | Phone (приём звонков) |
| `TWILIO_APP_URL` | твой публичный URL (ngrok) | база для Twilio-вебхуков; пусто → берётся app URL |
| `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | dashboard.stripe.com → Developers → API keys (test) | checkout, инвойсы |
| `STRIPE_WEBHOOK_SECRET` | выдаёт `stripe listen` (см. ниже) | верификация вебхуков |
| `SQUARE_*` / `PAYPAL_*` | developer.squareup.com / developer.paypal.com (sandbox) | альтернативные платёжки |
| `RESEND_API_KEY` **или** `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` | resend.com / свой SMTP | исходящие письма |
| `FROM_EMAIL`, `EMAIL_FROM`, `SUPPORT_NOTIFY_EMAIL` | свои адреса | адреса отправителя/уведомлений |
| `DEV_EMAIL_OVERRIDE` | свой адрес | вся почта в dev — на один ящик |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth credentials | вход через Google |
| `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET` | там же (отдельный OAuth-клиент) | Gmail-интеграция |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob | загрузка файлов |
| `SERPAPI_API_KEY` | serpapi.com | поиск (lead-фичи) |
| `FAL_KEY` | fal.ai | генерация изображений |
| `CRON_SECRET` | придумай строку | защита `/api/cron/*` |

## Фоновые сервисы

**Stripe** (после заполнения ключей):
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Выданный `whsec_…` вписать в `STRIPE_WEBHOOK_SECRET` в `.env.local` и перезапустить dev.

**Inngest** — в проекте НЕ используется, ничего поднимать не нужно.

**Twilio** — вебхуки должны быть доступны снаружи: `ngrok http 3000`, публичный URL в `TWILIO_APP_URL`; в консоли Twilio указать Voice URL `<TWILIO_APP_URL>/api/twilio/voice` (плюс recording-complete / transcription-complete).

**Кроны** — `/api/cron/*` дергаются вручную с заголовком секрета: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/follow-ups`.

## OAuth redirect URI для консолей провайдеров

- Google Sign-In: `http://localhost:3000/api/auth/callback/google`
- Gmail-интеграция: `http://localhost:3000/api/integrations/gmail/callback` (то же значение стоит в `GMAIL_OAUTH_REDIRECT_URI`)

## Известные ограничения

- **Subscription и Settings — витрины**: интерфейс кликается, но данные не сохраняются (проводка данных — отдельная незапущенная задача; решение owner'а от 2026-08-18).
- Smart Proposal: «Send to proposal» и кнопки материалов — заглушки без обработчиков (донорская фикстура).
- Roof estimator без EagleView-ключей показывает только плашку конфигурации — это задумано (гейт и на клиенте, и на сервере).
- Seed не идемпотентен — только для чистой базы.
- Прод-окружение Vercel из локалки не трогать: `vercel env add/rm` не выполнять, реальный прод — проект `epoxy-fox-main` (jobflex.app), линкована должна быть только `jobflex-v3`.
