# Настройка Supabase для HistoryGuesser

## Новый проект (рекомендуется EU)

1. [supabase.com](https://supabase.com) → **New project** → Region: **Frankfurt** или **London**.
2. **SQL Editor** → вставьте весь файл [`setup_complete.sql`](./setup_complete.sql) → **Run**.
3. **Project Settings → API**:
   - Project URL
   - `anon` `public` key
4. Вставьте в [`js/config/supabase.js`](../js/config/supabase.js):

```js
export const SUPABASE_URL = 'https://ВАШ-ПРОЕКТ.supabase.co';
export const SUPABASE_ANON_KEY = 'ваш-anon-key';
```

5. **Database → Replication** → убедитесь, что `rooms` и `room_players` в publication `supabase_realtime`.

6. **Обязательно (устраняет таймауты):** выполните [`migrations/002_rpc_rooms.sql`](./migrations/002_rpc_rooms.sql) → **Run**.

7. **Кнопки «Готов» / «Начать игру»:** выполните [`migrations/003_rpc_ready_start.sql`](./migrations/003_rpc_ready_start.sql) → **Run**.

```sql
select public.create_game_room('Тест', 'client-test-1', 5, 60);
```

Должен вернуться JSON с `room` и `players`.  
Если была ошибка `gen_random_bytes does not exist` — заново выполните обновлённый [`002_rpc_rooms.sql`](./migrations/002_rpc_rooms.sql).

## Предупреждения Security Advisor

| Предупреждение | Критично? |
|----------------|-----------|
| `rls_auto_enable` SECURITY DEFINER | Нет, системная функция Supabase — можно **Ignore** |
| RLS `USING (true)` на rooms / room_players / leaderboard | Ожидаемо для анонимной игры без Auth — **не блокирует** запросы |
| `get_server_now` search_path | Исправлено в `setup_complete.sql` |

Эти предупреждения **не блокируют** игру. Сообщения **Tracking Prevention** в браузере (Safeframe и т.п.) к Supabase **не относятся**.

Таймаут «Превышено время ожидания» = нет ответа от `*.supabase.co` за 28 с. Чаще всего: не выполнен `002_rpc_rooms.sql`, неверный URL/key, или сеть блокирует Supabase.

## Проверка

В SQL Editor:

```sql
select * from rooms limit 1;
select * from room_players limit 1;
select public.get_server_now();
```

Все три запроса должны выполняться без ошибки.

## Ошибка 409 при создании комнаты

1. Убедитесь, что выполнен **весь** `setup_complete.sql` (таблицы `rooms`, `room_players`).
2. В SQL Editor проверьте тестовую вставку:

```sql
insert into public.rooms (code, status, total_rounds, timer_duration_sec)
values ('TEST01', 'lobby', 5, 60)
returning *;
```

Если вставка в SQL работает, а в игре — нет: обновите страницу (Ctrl+F5) и проверьте URL/key в `js/config/supabase.js`.

3. Очистка тестовых комнат (по желанию):

```sql
truncate public.room_players, public.rooms cascade;
```
