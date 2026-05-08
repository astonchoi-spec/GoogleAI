import { createClient } from '@libsql/client';
const c = createClient({ url: 'file:./data/chat.db' });
const r = await c.execute("SELECT id, role, source, substr(content,1,45) as p, createdAt as raw, datetime(createdAt,'unixepoch','+9 hours') as t FROM messages WHERE conversationId=2 ORDER BY id DESC LIMIT 8");
console.log(r.rows);
