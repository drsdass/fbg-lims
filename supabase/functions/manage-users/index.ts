// manage-users: admin-only user management for the FBG portal.
// Actions: list, create, update, setActive, resetPassword, resetMfa.
// Every change is written to the audit log under the admin who made it.
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => (Deno.env.get(k) ?? "").trim();
const SB_URL = env("SUPABASE_URL");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY") || env("SUPABASE_SECRET_KEY");
const cors = {
  "Access-Control-Allow-Origin": env("PORTAL_URL").replace(/\/+$/, "") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const LAB_ROLES = ["admin", "scientist", "reporting", "sales", "billing", "auditor"];

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => chars[x % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

  // Caller must be signed in, two-step verified, and an active lab admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "Not signed in" }, 401);
  let aal = "";
  try { aal = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal; } catch { /* ignore */ }
  if (aal !== "aal2") return json({ error: "Two-step verification required" }, 403);
  const { data: me } = await admin.from("profiles").select("*").eq("user_id", u.user.id).maybeSingle();
  if (!me || me.role !== "lab" || !me.active || !(me.lab_roles ?? []).includes("admin")) return json({ error: "Only an admin can manage users" }, 403);
  const actor = u.user.id;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const save = (p: any) => admin.rpc("admin_save_profile", {
    p_actor: actor, p_user: p.user_id, p_role: p.role, p_lab_roles: p.lab_roles ?? [], p_clinic: p.clinic_id ?? null,
    p_name: p.name ?? "", p_email: p.email ?? "", p_active: p.active ?? true, p_must_change: p.must_change_pw ?? null,
  });
  const note = (action: string, row: string, detail: Record<string, unknown>) =>
    admin.from("audit_log").insert({ actor, action, tbl: "profiles", row_id: row, detail });
  const adminsLeft = async (excluding: string) => {
    const { data } = await admin.from("profiles").select("user_id,lab_roles,active").eq("role", "lab").eq("active", true);
    return (data ?? []).filter((p: any) => p.user_id !== excluding && (p.lab_roles ?? []).includes("admin")).length;
  };
  const clean = (b: any) => {
    const kind = b.kind === "clinic" ? "clinic" : "lab";
    const roles = kind === "lab" ? [...new Set((b.roles ?? []).filter((r: string) => LAB_ROLES.includes(r)))] : [];
    if (kind === "lab" && !roles.length) throw new Error("Choose at least one role.");
    if (kind === "clinic" && !b.clinicId) throw new Error("Choose the clinic this user belongs to.");
    return { kind, roles, clinic: kind === "clinic" ? b.clinicId : null, name: String(b.name ?? "").trim() };
  };

  try {
    switch (body.action) {
      case "list": {
        const users: any[] = [];
        for (let page = 1; page < 50; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          users.push(...data.users);
          if (data.users.length < 1000) break;
        }
        const { data: profs } = await admin.from("profiles").select("*");
        const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
        return json({ users: users.map((x) => {
          const p: any = byId.get(x.id) ?? {};
          return {
            id: x.id, email: x.email, name: p.name ?? x.user_metadata?.name ?? "", kind: p.role ?? null,
            roles: p.lab_roles ?? [], clinicId: p.clinic_id ?? null, active: p.active ?? false, linked: !!p.user_id,
            mustChange: !!p.must_change_pw, lastSignIn: x.last_sign_in_at, createdAt: x.created_at,
            mfa: (x.factors ?? []).some((f: any) => f.status === "verified"),
          };
        }) });
      }
      case "create": {
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
        const c = clean(body);
        const pw = tempPassword();
        let userId: string;
        const { data: created, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name: c.name } });
        if (error) {
          // The person may already have a login (for example, they registered). Link it instead.
          const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const found = list?.users.find((x) => (x.email ?? "").toLowerCase() === email);
          if (!found) throw error;
          const { data: existing } = await admin.from("profiles").select("user_id").eq("user_id", found.id).maybeSingle();
          if (existing) throw new Error("That person already has access. Edit them in the list instead.");
          userId = found.id;
          await admin.auth.admin.updateUserById(userId, { password: pw });
        } else userId = created.user.id;
        const r = await save({ user_id: userId, role: c.kind, lab_roles: c.roles, clinic_id: c.clinic, name: c.name, email, active: true, must_change_pw: true });
        if (r.error) throw r.error;
        return json({ ok: true, userId, tempPassword: pw });
      }
      case "update": {
        const c = clean(body);
        const { data: p } = await admin.from("profiles").select("*").eq("user_id", body.userId).maybeSingle();
        const { data: au } = await admin.auth.admin.getUserById(body.userId);
        if (!au?.user) throw new Error("User not found.");
        const losingAdmin = p?.role === "lab" && (p.lab_roles ?? []).includes("admin") && !(c.kind === "lab" && c.roles.includes("admin"));
        if (losingAdmin && (await adminsLeft(body.userId)) === 0) throw new Error("There must always be at least one admin.");
        const r = await save({ user_id: body.userId, role: c.kind, lab_roles: c.roles, clinic_id: c.clinic, name: c.name || p?.name, email: au.user.email, active: p?.active ?? true });
        if (r.error) throw r.error;
        return json({ ok: true });
      }
      case "setActive": {
        if (body.userId === actor && !body.active) throw new Error("You can't deactivate your own account.");
        const { data: p } = await admin.from("profiles").select("*").eq("user_id", body.userId).maybeSingle();
        if (!p) throw new Error("This user has no access to change.");
        if (!body.active && p.role === "lab" && (p.lab_roles ?? []).includes("admin") && (await adminsLeft(body.userId)) === 0)
          throw new Error("There must always be at least one active admin.");
        const { error } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: body.active ? "none" : "876000h" });
        if (error) throw error;
        const r = await save({ ...p, active: !!body.active });
        if (r.error) throw r.error;
        return json({ ok: true });
      }
      case "resetPassword": {
        const pw = tempPassword();
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password: pw });
        if (error) throw error;
        const { data: p } = await admin.from("profiles").select("*").eq("user_id", body.userId).maybeSingle();
        if (p) { const r = await save({ ...p, must_change_pw: true }); if (r.error) throw r.error; }
        await note("reset_password", body.userId, {});
        return json({ ok: true, tempPassword: pw });
      }
      case "resetMfa": {
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: body.userId });
        if (error) throw error;
        for (const f of data.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: body.userId, id: f.id });
        await note("reset_mfa", body.userId, { removed: (data.factors ?? []).length });
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
