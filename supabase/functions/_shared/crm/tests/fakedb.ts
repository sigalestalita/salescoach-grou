/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase em memória: só o que a fila de CRM usa.
type Row = Record<string, any>;
export function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const id = () => `id-${++seq}`;
  function builder(table: string) {
    const st: any = { op: "select", filters: [] as ((r: Row) => boolean)[], order: null, limit: null, values: null, returning: false, conflict: null };
    const rows = () => (tables[table] ??= []);
    const exec = () => {
      let matched = rows().filter((r) => st.filters.every((f: any) => f(r)));
      if (st.op === "select") {
        if (st.order) matched = [...matched].sort((a, b) => (a[st.order.col] > b[st.order.col] ? 1 : -1) * (st.order.asc ? 1 : -1));
        if (st.limit) matched = matched.slice(0, st.limit);
        return matched;
      }
      if (st.op === "update") { matched.forEach((r) => Object.assign(r, st.values)); return matched; }
      if (st.op === "delete") { tables[table] = rows().filter((r) => !matched.includes(r)); return matched; }
      if (st.op === "insert" || st.op === "upsert") {
        const vals = Array.isArray(st.values) ? st.values : [st.values];
        return vals.map((v: Row) => {
          const keys = st.conflict ? st.conflict.split(",") : (table === "crm_credentials" ? ["connection_id"] : null);
          const existing = keys && rows().find((r) => keys.every((k: string) => r[k] === v[k]));
          if (st.op === "upsert" && existing) { Object.assign(existing, v); return existing; }
          // Restrição de unicidade usada pelos bots de reunião.
          if (table === "meeting_bots" && rows().some((r) => r.recall_bot_id === v.recall_bot_id)) { st.error = { message: "duplicate key" }; return null; }
          const defaults = table === "crm_sync_jobs" ? { status: "pendente", attempts: 0, next_attempt_at: new Date().toISOString(), sent: null } : {};
          const row = { id: id(), created_at: new Date().toISOString(), ...defaults, ...v }; rows().push(row); return row;
        });
      }
      return [];
    };
    const api: any = {
      select() { if (st.op !== "select") st.returning = true; return api; },
      insert(v: Row) { st.op = "insert"; st.values = v; return api; },
      upsert(v: Row, o?: any) { st.op = "upsert"; st.values = v; st.conflict = o?.onConflict ?? null; return api; },
      update(v: Row) { st.op = "update"; st.values = v; return api; },
      delete() { st.op = "delete"; return api; },
      eq(c: string, v: any) { st.filters.push((r: Row) => r[c] === v); return api; },
      neq(c: string, v: any) { st.filters.push((r: Row) => r[c] !== v); return api; },
      in(c: string, v: any[]) { st.filters.push((r: Row) => v.includes(r[c])); return api; },
      not(c: string, op: string, v: any) {
        if (op === "is") st.filters.push((r: Row) => r[c] !== v && !(v === null && r[c] === undefined));
        else if (op === "in") { const list = String(v).replace(/[()]/g, "").split(","); st.filters.push((r: Row) => !list.includes(String(r[c]))); }
        return api;
      },
      lte(c: string, v: any) { st.filters.push((r: Row) => r[c] <= v); return api; },
      lt(c: string, v: any) { st.filters.push((r: Row) => r[c] < v); return api; },
      order(c: string, o?: any) { st.order = { col: c, asc: o?.ascending !== false }; return api; },
      limit(n: number) { st.limit = n; return api; },
      maybeSingle: async () => { const d = exec(); return { data: st.error ? null : d[0] ?? null, error: st.error ?? null }; },
      single: async () => { const r = exec()[0]; if (st.error) return { data: null, error: st.error }; return r ? { data: r, error: null } : { data: null, error: { message: "não encontrado" } }; },
      then(res: any, rej: any) { try { const d = exec(); return Promise.resolve({ data: st.error ? null : d, error: st.error ?? null }).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
    };
    return api;
  }
  return { from: (t: string) => builder(t), tables };
}
