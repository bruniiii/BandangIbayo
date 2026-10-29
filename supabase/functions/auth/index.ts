// supabase/functions/auth/index.ts
//
// Login with lockout, plus password changes.
//
//   - "login"   { identifier, password }   identifier = email or username
//        3 wrong passwords in a row lock the account for 15 minutes. On the right
//        password it returns { access_token, refresh_token } for
//        supabase.auth.setSession() (no emailed code any more).
//   - "signup"  { email, password, profile }   registration: checks the details
//        and emails a 6-digit code; returns { challengeId, sentTo, expiresInMinutes }.
//        No account exists yet: it's created only when the right code is entered.
//   - "verify"  { challengeId, code, password? }   right code (10 minutes, 5 tries)
//        → for a registration, creates the account (password sent again here) with
//        its email confirmed; returns { access_token, refresh_token } for setSession().
//        (Also finishes logins started before the login code was removed.)
//   - "resend"  { challengeId }   new code (max 3 resends, 60 s apart)
//   - "change-password"  { currentPassword, newPassword }   logged-in user; checks the
//        current password (wrong ones count toward the lock) and the password rules
//   - "password-changed"   logged-in user (after a reset link): clears their lock
//
// Deploy:  supabase functions deploy auth --no-verify-jwt
// Uses the send-email function (Gmail) to deliver the code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SERVICE_ROLE;

const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 15;
const CODE_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const MAX_RESENDS = 3;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
// A throwaway client per sign-in, so sessions never leak between requests.
const freshClient = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

// Same rules as src/passwordPolicy.js
const PASSWORD_RULES: [RegExp | ((p: string) => boolean), string][] = [
  [(p) => p.length >= 8, "at least 8 characters"],
  [/[A-Z]/, "an uppercase letter"],
  [/[a-z]/, "a lowercase letter"],
  [/[0-9]/, "a number"],
  [/[^A-Za-z0-9]/, "a special character"],
];
const passwordProblems = (p: string) =>
  PASSWORD_RULES.filter(([rule]) => (typeof rule === "function" ? !rule(p) : !rule.test(p))).map(([, label]) => label);

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
const codeHash = (challengeId: string, code: string) => sha256(`${challengeId}:${code}:${SERVICE_ROLE}`);
const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const maskEmail = (email: string) => email.replace(/^(.)(.*)(.@.*)$/, (_, a, b, c) => a + "*".repeat(Math.max(1, b.length)) + c);
const minutesLeft = (until: string) => Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));

// ───────────── Lockout ─────────────
async function lockState(email: string) {
  const { data } = await admin.from("login_lockouts").select("*").eq("email", email).maybeSingle();
  return data as { email: string; failed_count: number; locked_until: string | null } | null;
}

async function assertNotLocked(email: string) {
  const state = await lockState(email);
  if (state?.locked_until && new Date(state.locked_until).getTime() > Date.now()) {
    const mins = minutesLeft(state.locked_until);
    throw new HttpError(423, `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`, { lockedMinutes: mins });
  }
  return state;
}

async function recordFailure(email: string, state: Awaited<ReturnType<typeof lockState>>) {
  const expiredLock = state?.locked_until && new Date(state.locked_until).getTime() <= Date.now();
  const failed = (expiredLock ? 0 : state?.failed_count ?? 0) + 1;
  if (failed >= MAX_ATTEMPTS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await admin.from("login_lockouts").upsert({ email, failed_count: 0, locked_until: until, updated_at: new Date().toISOString() });
    throw new HttpError(423, `Too many wrong passwords. Your account is locked for ${LOCK_MINUTES} minutes. You can also reset your password.`, { lockedMinutes: LOCK_MINUTES });
  }
  await admin.from("login_lockouts").upsert({ email, failed_count: failed, locked_until: null, updated_at: new Date().toISOString() });
  const left = MAX_ATTEMPTS - failed;
  throw new HttpError(401, `Invalid password. ${left} attempt${left === 1 ? "" : "s"} left before your account is locked for ${LOCK_MINUTES} minutes.`, { attemptsLeft: left, field: "password" });
}

const clearLock = (email: string) => admin.from("login_lockouts").delete().eq("email", email);

// Checks a password without handing the session to anyone; the session is revoked at once.
async function checkPassword(email: string, password: string) {
  const { data, error } = await freshClient().auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) throw new HttpError(403, "This account isn't verified yet. Please register again with this email to get a new 6-digit code.");
    return null;
  }
  await admin.auth.admin.signOut(data.session.access_token, "local").catch(() => {});
  // Registered but never entered the emailed code (Supabase lets these in when
  // its own "Confirm email" setting is off).
  if (!data.user.email_confirmed_at) {
    throw new HttpError(403, "This account isn't verified yet. Please register again with this email to get a new 6-digit code.");
  }
  return data.user;
}

// Keeps work running after the reply is sent (Supabase Edge Runtime).
const inBackground = (task: Promise<unknown>) => {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task); else task.catch(() => {});
};

// ───────────── Codes ─────────────
async function sendCode(email: string, name: string, code: string, purpose: "login" | "signup" = "login") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "login-code", to: email, name, code, minutes: CODE_MINUTES, purpose }),
  });
  if (!res.ok) throw new HttpError(502, "We couldn't email your verification code. Please try again.");
}

// Exact, case-insensitive match on one profile column (wildcards in what was
// typed are escaped, then the result is re-checked).
async function findProfileEmail(column: "username" | "email", value: string) {
  const pattern = value.replace(/[\\%_*]/g, (c) => "\\" + c);
  const { data } = await admin.from("profiles").select(`${column}, email`).ilike(column, pattern).limit(10);
  const match = (data ?? []).find((p: Record<string, unknown>) => String(p[column] ?? "").toLowerCase() === value.toLowerCase());
  return match?.email ? String(match.email).toLowerCase() : null;
}

// The email to sign in with, and whether we know an account has it.
// Accepts an email, "juan@gmail", a username, or a Gmail address typed
// without "@gmail.com" ("juan" → the account with username juan, otherwise
// juan@gmail.com).
async function resolveEmail(identifier: string) {
  let id = identifier.trim();
  if (/@gmail$/i.test(id)) id += ".com";
  if (!id.includes("@")) {
    const byUsername = await findProfileEmail("username", id);
    if (byUsername) return { email: byUsername, known: true };
    id = `${id}@gmail.com`;
  }
  const email = id.toLowerCase();
  return { email, known: Boolean(await findProfileEmail("email", email)) };
}

async function login(p: any) {
  const identifier = String(p.identifier ?? "").trim();
  const password = String(p.password ?? "");
  if (!identifier || !password) throw new HttpError(400, "Please enter your username/email and password.");

  // The password is checked even when no profile matches (an account can exist
  // without its email in profiles), so the right password always gets in.
  const { email, known } = await resolveEmail(identifier);
  const state = await assertNotLocked(email);
  const user = await checkPassword(email, password);
  if (!user) {
    // Says which part is wrong: no such account, or the wrong password (which counts toward the lock).
    if (!known) throw new HttpError(404, "No account found with that username or Gmail.", { field: "identifier" });
    await recordFailure(email, state);
  }
  await clearLock(email);
  return await startSession(email);
}

// Signs the account in: a one-time sign-in link, used here and never sent.
async function startSession(email: string) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw new Error(linkError.message);
  const tokenHash = link.properties?.hashed_token;
  let session = null;
  for (const type of ["magiclink", "email"] as const) {
    const { data, error } = await freshClient().auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.session) { session = data.session; break; }
  }
  if (!session) throw new Error("Could not start your session. Please log in again.");
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

const firstNameOf = async (userId: string) =>
  ((await admin.from("profiles").select("first_name").eq("id", userId).maybeSingle()).data?.first_name as string) ?? "";

async function loadChallenge(challengeId: unknown) {
  const { data } = await admin.from("login_challenges").select("*").eq("id", challengeId).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) {
    throw new HttpError(410, "This code has expired. Please log in again.");
  }
  return data;
}

async function verify(p: any) {
  if (await loadSignup(p.challengeId, false)) return await verifySignup(p);
  const challenge = await loadChallenge(p.challengeId);
  if (challenge.attempts >= MAX_CODE_TRIES) {
    await admin.from("login_challenges").delete().eq("id", challenge.id);
    throw new HttpError(429, "Too many wrong codes. Please log in again.");
  }
  const code = String(p.code ?? "").replace(/\D/g, "");
  if (code.length !== 6 || (await codeHash(challenge.id, code)) !== challenge.code_hash) {
    const left = MAX_CODE_TRIES - challenge.attempts - 1;
    await admin.from("login_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
    throw new HttpError(401, left > 0 ? `That code isn't right. ${left} tr${left === 1 ? "y" : "ies"} left.` : "Too many wrong codes. Please log in again.");
  }
  await admin.from("login_challenges").delete().eq("id", challenge.id);
  // The code proves the email works: mark it confirmed (new registrations).
  await admin.auth.admin.updateUserById(challenge.user_id, { email_confirm: true });
  return await startSession(challenge.email);
}

// ───────────── Registration with an emailed code ─────────────
// What the registration form may save on the profile (copied into profiles by
// the on_auth_user_created trigger).
const PROFILE_FIELDS = [
  "username", "first_name", "middle_name", "last_name", "suffix", "phone_number", "date_of_birth",
  "address", "province", "city_municipality", "barangay", "street",
  "emergency_contact_name", "emergency_contact_number", "terms_accepted",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// A registration waiting for its code: email, profile and the code's hash
// (never the password; the form sends it again with the code).
async function loadSignup(challengeId: unknown, required = true) {
  if (typeof challengeId !== "string" || !/^[0-9a-f-]{36}$/i.test(challengeId)) {
    if (required) throw new HttpError(410, "This code has expired. Please register again.");
    return null;
  }
  const { data } = await admin.from("signup_challenges").select("*").eq("id", challengeId).maybeSingle();
  if (!data) {
    if (required) throw new HttpError(410, "This code has expired. Please register again.");
    return null;
  }
  if (new Date(data.expires_at).getTime() < Date.now()) throw new HttpError(410, "This code has expired. Please register again.");
  return data;
}

// An existing account with this email: { id, confirmed } or null.
// (A database lookup: generateLink would create a missing account.)
async function accountFor(email: string) {
  const { data, error } = await admin.rpc("auth_account_for_email", { p_email: email });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row?.id ? { id: String(row.id), confirmed: Boolean(row.confirmed) } : null;
}

const ALREADY_REGISTERED = 'This email is already registered. Please log in, or use "Forgot password?" on the login page.';

// The accounts already using this username.
async function usernameOwners(username: unknown): Promise<string[]> {
  const name = String(username ?? "").trim();
  if (!name) return [];
  const pattern = name.replace(/[\\%_*]/g, (c) => "\\" + c);
  const { data } = await admin.from("profiles").select("id, username").ilike("username", pattern).limit(10);
  return (data ?? []).filter((r: any) => String(r.username ?? "").toLowerCase() === name.toLowerCase()).map((r: any) => String(r.id));
}

async function signup(p: any) {
  const email = String(p.email ?? "").trim().toLowerCase();
  const password = String(p.password ?? "");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email address, like juan@gmail.com.", { field: "email" });
  const problems = passwordProblems(password);
  if (problems.length) throw new HttpError(400, `Your password needs ${problems.join(", ")}.`, { field: "password" });
  const profile: Record<string, unknown> = {};
  for (const key of PROFILE_FIELDS) if (p.profile?.[key] !== undefined) profile[key] = p.profile[key];

  // A verified account can't be registered again. (An unverified one, left by
  // the old sign-up, is taken over once the code is entered.)
  const [existing, takenBy] = await Promise.all([accountFor(email), usernameOwners(profile.username)]);
  if (existing?.confirmed) throw new HttpError(409, ALREADY_REGISTERED, { field: "email" });
  if (takenBy.some((id) => id !== existing?.id)) {
    throw new HttpError(409, "This username is already taken. Please choose another one.", { field: "username" });
  }

  // One waiting registration per email; old ones are cleared out.
  await Promise.all([
    admin.from("signup_challenges").delete().eq("email", email),
    admin.from("signup_challenges").delete().lt("expires_at", new Date(Date.now() - 86400000).toISOString()),
  ]);
  const challengeId = crypto.randomUUID();
  const code = newCode();
  const { error } = await admin.from("signup_challenges").insert({
    id: challengeId,
    email,
    profile,
    code_hash: await codeHash(challengeId, code),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
  });
  if (error) throw new Error(error.message);
  // The email goes out in the background so the form doesn't wait on Gmail;
  // if it fails, "Resend code" sends another.
  inBackground(sendCode(email, String(profile.first_name ?? ""), code, "signup")
    .catch((err) => console.error("auth: signup code email failed", err)));
  return { challengeId, sentTo: maskEmail(email), expiresInMinutes: CODE_MINUTES };
}

// The right code: now the account is created, with its email confirmed.
async function verifySignup(p: any) {
  const challenge = await loadSignup(p.challengeId);
  if (challenge.attempts >= MAX_CODE_TRIES) {
    await admin.from("signup_challenges").delete().eq("id", challenge.id);
    throw new HttpError(429, "Too many wrong codes. Please register again.");
  }
  const code = String(p.code ?? "").replace(/\D/g, "");
  if (code.length !== 6 || (await codeHash(challenge.id, code)) !== challenge.code_hash) {
    const left = MAX_CODE_TRIES - challenge.attempts - 1;
    await admin.from("signup_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challenge.id);
    throw new HttpError(401, left > 0 ? `That code isn't right. ${left} tr${left === 1 ? "y" : "ies"} left.` : "Too many wrong codes. Please register again.");
  }
  const password = String(p.password ?? "");
  const problems = passwordProblems(password);
  if (problems.length) throw new HttpError(400, `Your password needs ${problems.join(", ")}.`);

  const email = challenge.email as string;
  const profile = (challenge.profile ?? {}) as Record<string, unknown>;
  const existing = await accountFor(email);
  if (existing?.confirmed) {
    await admin.from("signup_challenges").delete().eq("id", challenge.id);
    throw new HttpError(409, ALREADY_REGISTERED, { field: "email" });
  }
  if (existing) {
    // Left unverified by the old sign-up: it becomes this registration.
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, user_metadata: profile, email_confirm: true });
    if (error) throw new HttpError(400, error.message);
    const { terms_accepted: _t, ...profileRow } = profile;
    await admin.from("profiles").update(profileRow).eq("id", existing.id);
  } else {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: profile });
    if (created.error) {
      if (/database error/i.test(created.error.message)) {
        throw new HttpError(409, "This username is already taken. Please choose another one.", { field: "username" });
      }
      if (/already|registered|exists/i.test(created.error.message)) throw new HttpError(409, ALREADY_REGISTERED, { field: "email" });
      throw new HttpError(400, created.error.message);
    }
  }
  await admin.from("signup_challenges").delete().eq("id", challenge.id);
  return await startSession(email);
}

async function resendSignup(challenge: any) {
  if (challenge.resends >= MAX_RESENDS) throw new HttpError(429, "You've asked for too many codes. Please register again.");
  if (Date.now() - new Date(challenge.last_sent_at).getTime() < 60000) {
    throw new HttpError(429, "Please wait a minute before asking for another code.");
  }
  const code = newCode();
  await admin.from("signup_challenges").update({
    code_hash: await codeHash(challenge.id, code),
    attempts: 0,
    resends: challenge.resends + 1,
    last_sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
  }).eq("id", challenge.id);
  await sendCode(challenge.email, String(challenge.profile?.first_name ?? ""), code, "signup");
  return { sentTo: maskEmail(challenge.email) };
}

async function resend(p: any) {
  const pending = await loadSignup(p.challengeId, false);
  if (pending) return await resendSignup(pending);
  const challenge = await loadChallenge(p.challengeId);
  if (challenge.resends >= MAX_RESENDS) throw new HttpError(429, "You've asked for too many codes. Please log in again.");
  if (Date.now() - new Date(challenge.last_sent_at).getTime() < 60000) {
    throw new HttpError(429, "Please wait a minute before asking for another code.");
  }
  const code = newCode();
  await admin.from("login_challenges").update({
    code_hash: await codeHash(challenge.id, code),
    attempts: 0,
    resends: challenge.resends + 1,
    last_sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
  }).eq("id", challenge.id);
  // Not verified yet → it's a registration code, worded as such.
  const { data: owner } = await admin.auth.admin.getUserById(challenge.user_id);
  await sendCode(challenge.email, await firstNameOf(challenge.user_id), code, owner?.user?.email_confirmed_at ? "login" : "signup");
  return { sentTo: maskEmail(challenge.email) };
}

async function changePassword(user: { id: string; email?: string }, p: any) {
  const email = String(user.email ?? "").toLowerCase();
  const current = String(p.currentPassword ?? "");
  const next = String(p.newPassword ?? "");
  const problems = passwordProblems(next);
  if (problems.length) throw new HttpError(400, `Your new password needs ${problems.join(", ")}.`);
  if (current === next) throw new HttpError(400, "Your new password must be different from the current one.");

  const state = await assertNotLocked(email);
  const ok = await checkPassword(email, current);
  if (!ok) {
    try { await recordFailure(email, state); } catch (err) {
      if (err instanceof HttpError && err.status === 401) {
        throw new HttpError(401, "Your current password is incorrect. " + String(err.message).split(". ").slice(1).join(". "));
      }
      throw err;
    }
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: next });
  if (error) throw new HttpError(400, error.message);
  await clearLock(email);
  return { success: true };
}

// ───────────── Request handler ─────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const p = await req.json().catch(() => ({}));
    switch (p.action) {
      case "login": return reply(await login(p));
      case "signup": return reply(await signup(p));
      case "verify": return reply(await verify(p));
      case "resend": return reply(await resend(p));
    }

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) return reply({ error: "Please log in again." }, 401);

    switch (p.action) {
      case "change-password": return reply(await changePassword(userData.user, p));
      case "password-changed":
        await clearLock(String(userData.user.email ?? "").toLowerCase());
        return reply({ success: true });
      default: return reply({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof HttpError) return reply({ error: err.message, ...err.extra }, err.status);
    console.error("auth: error", err);
    return reply({ error: "Something went wrong. Please try again." }, 500);
  }
});
