import { createClient } from '@libsql/client';
const c = createClient({ url: 'file:./data/chat.db' });
const baseline = await c.execute("SELECT MAX(id) as maxid FROM messages WHERE source='telegram'");
const baseMaxId = baseline.rows[0]?.maxid ?? 0;
console.log(`baseline telegram maxId=${baseMaxId}`);
let lastSeen = baseMaxId;
setInterval(async () => {
  const r = await c.execute({
    sql: "SELECT id, role, source, substr(content,1,60) as p, datetime(createdAt,'unixepoch','+9 hours') as t FROM messages WHERE id > ? ORDER BY id ASC",
    args: [lastSeen],
  });
  for (const m of r.rows) {
    console.log(`[NEW] id=${m.id} role=${m.role} src=${m.source} t=${m.t} | ${m.p}`);
    lastSeen = Math.max(lastSeen, Number(m.id));
  }
}, 1500);
