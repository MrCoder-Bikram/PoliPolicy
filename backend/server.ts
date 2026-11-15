import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  execute,
  hashPassword,
  initDatabase,
  queryAll,
  queryOne,
  verifyPassword,
} from './db.js';
import {
  computeAdminAnalytics,
  maskAccountIdentifier,
  validateApplicationInput,
  validateClaimInput,
  validateClaimNoteInput,
  validateInquiryInput,
  validatePaymentInput,
  validatePolicyInput,
  validateRegistrationInput,
  type ApplicationRecord,
  type ApplicationStatus,
  type ClaimRecord,
  type ClaimStatus,
  type PaymentMethod,
  type PaymentRecord,
  type PolicyRecord,
  type UserRole,
} from '../frontend/src/utils/insuranceRules.js';

export const app = express();
const PORT = Number(process.env.PORT) || 3000;
const COOKIE_NAME = 'insurecare_session';
const isProductionDeploy =
  Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
const SESSION_SECRET =
  process.env.SESSION_SECRET?.trim() ||
  (isProductionDeploy ? '' : 'local-development-session-secret');
const OWNER_EMAIL =
  process.env.OWNER_EMAIL?.trim().toLowerCase() ||
  (isProductionDeploy ? '' : 'lahaayan864@gmail.com');
const revokedTokens = new Set<string>();

const jsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  if (req.body !== undefined && typeof req.body === 'object' && req.body !== null) {
    next();
    return;
  }
  jsonParser(req, res, next);
});

interface AuthUser {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
}

interface AuthedRequest extends express.Request {
  user?: AuthUser;
  sessionToken?: string;
}

function asyncHandler(
  fn: (req: AuthedRequest, res: express.Response, next: express.NextFunction) => Promise<void>
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as AuthedRequest, res, next)).catch(next);
  };
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

interface TokenPayload {
  uid: number;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  exp: number;
}

function signSessionPayload(user: AuthUser, expMs: number): string {
  const payload: TokenPayload = {
    uid: user.user_id,
    email: user.email,
    full_name: user.full_name,
    phone: user.phone,
    role: user.role,
    exp: expMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifySignedToken(token: string): TokenPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) return null;
  const payloadB64 = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed || typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function createSessionForUser(user: AuthUser): Promise<string> {
  const expMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const token = signSessionPayload(user, expMs);
  const expiresAt = new Date(expMs).toISOString();
  await execute('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [
    user.user_id,
    token,
    expiresAt,
  ]);
  return token;
}

function setSessionCookie(res: express.Response, token: string) {
  const secureAttribute = isProductionDeploy ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secureAttribute}`
  );
}

function clearSessionCookie(res: express.Response) {
  const secureAttribute = isProductionDeploy ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`
  );
}

async function recordAuditLog(
  actor: { user_id: number | null; full_name: string; role: string },
  action: string,
  targetType: string,
  targetId: string,
  details: string
) {
  await execute(
    `INSERT INTO audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [actor.user_id, actor.full_name, actor.role, action, targetType, targetId, details]
  );
}

async function createUserNotification(
  userId: number,
  title: string,
  message: string,
  channel: 'In-App' | 'Email' | 'SMS' = 'In-App'
) {
  await execute(
    `INSERT INTO notifications (user_id, title, message, channel, is_read)
     VALUES (?, ?, ?, ?, 0)`,
    [userId, title, message, channel]
  );
}

const attachUser = asyncHandler(async (req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const token = bearerToken || cookies[COOKIE_NAME];

  if (token && !revokedTokens.has(token)) {
    const row = await queryOne<AuthUser & { expires_at: string }>(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.role, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.token = ?`,
      [token]
    );

    if (row && new Date(row.expires_at).getTime() > Date.now()) {
      const effectiveRole: UserRole =
        row.email.trim().toLowerCase() === OWNER_EMAIL ? 'admin' : row.role;
      req.user = {
        user_id: row.user_id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        role: effectiveRole,
        created_at: String(row.created_at),
      };
      req.sessionToken = token;
      next();
      return;
    }

    const signed = verifySignedToken(token);
    if (signed) {
      const normalizedEmail = signed.email.trim().toLowerCase();
      const expectedRole: UserRole = normalizedEmail === OWNER_EMAIL ? 'admin' : signed.role;

      let dbUser = await queryOne<AuthUser>(
        'SELECT user_id, full_name, email, phone, role, created_at FROM users WHERE LOWER(email) = ?',
        [normalizedEmail]
      );

      if (!dbUser) {
        const placeholderHash = hashPassword(crypto.randomBytes(16).toString('hex'));
        const inserted = await execute(
          `INSERT INTO users (full_name, email, phone, password_hash, role)
           VALUES (?, ?, ?, ?, ?)`,
          [
            signed.full_name || 'PolicyPulse Member',
            normalizedEmail,
            signed.phone || '+1 415 555 0100',
            placeholderHash,
            expectedRole,
          ]
        );
        dbUser = await queryOne<AuthUser>(
          'SELECT user_id, full_name, email, phone, role, created_at FROM users WHERE user_id = ?',
          [inserted.insertId]
        );
      } else if (expectedRole === 'admin' && dbUser.role !== 'admin') {
        await execute('UPDATE users SET role = ? WHERE user_id = ?', ['admin', dbUser.user_id]);
        dbUser.role = 'admin';
      }

      if (dbUser) {
        try {
          await execute('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)', [
            dbUser.user_id,
            token,
            new Date(signed.exp).toISOString(),
          ]);
        } catch {
          // Session token may already exist from a concurrent request; safe to ignore.
        }

        req.user = {
          user_id: dbUser.user_id,
          full_name: dbUser.full_name,
          email: dbUser.email,
          phone: dbUser.phone,
          role: dbUser.role,
          created_at: String(dbUser.created_at),
        };
        req.sessionToken = token;
      }
    }
  }
  next();
});

function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
    return;
  }
  next();
}

app.use('/api', attachUser);

// --- Auth Routes ---
app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    const { full_name = '', email = '', phone = '', password = '' } = req.body ?? {};
    const check = validateRegistrationInput({ full_name, email, phone, password });
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await queryOne('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      res.status(409).json({
        error: 'An account with this email already exists.',
        errors: { email: 'An account with this email already exists.' },
      });
      return;
    }

    const passwordHash = hashPassword(String(password));
    const inserted = await execute(
      `INSERT INTO users (full_name, email, phone, password_hash, role)
       VALUES (?, ?, ?, ?, 'customer')`,
      [String(full_name).trim(), normalizedEmail, String(phone).trim(), passwordHash]
    );

    const user = (await queryOne<AuthUser>(
      'SELECT user_id, full_name, email, phone, role, created_at FROM users WHERE user_id = ?',
      [inserted.insertId]
    )) as AuthUser;

    await createUserNotification(
      user.user_id,
      'Welcome to PolicyPulse',
      'Your member account is active. Browse health plans to submit your first application.',
      'Email'
    );
    await recordAuditLog(
      user,
      'USER_REGISTERED',
      'user',
      `#${user.user_id}`,
      `Registered new member account (${user.email}).`
    );

    const token = await createSessionForUser(user);
    setSessionCookie(res, token);
    res.status(201).json({ user, token });
  })
);

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email = '', password = '' } = req.body ?? {};
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = await queryOne<AuthUser & { password_hash: string }>(
      'SELECT user_id, full_name, email, phone, password_hash, role, created_at FROM users WHERE LOWER(email) = ?',
      [normalizedEmail]
    );

    if (!row || !verifyPassword(String(password), row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const effectiveRole: UserRole =
      row.email.trim().toLowerCase() === OWNER_EMAIL ? 'admin' : row.role;
    if (effectiveRole === 'admin' && row.role !== 'admin') {
      await execute('UPDATE users SET role = ? WHERE user_id = ?', ['admin', row.user_id]);
    }

    const user: AuthUser = {
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      role: effectiveRole,
      created_at: String(row.created_at),
    };

    await recordAuditLog(
      user,
      'USER_LOGIN',
      'user',
      `#${user.user_id}`,
      `Signed in (${user.email}).`
    );

    const token = await createSessionForUser(user);
    setSessionCookie(res, token);
    res.json({ user, token });
  })
);

app.post(
  '/api/auth/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { current_password = '', new_password = '' } = req.body ?? {};
    if (!current_password || !new_password || String(new_password).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const row = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE user_id = ?',
      [req.user!.user_id]
    );

    if (!row || !verifyPassword(String(current_password), row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }

    await execute('UPDATE users SET password_hash = ? WHERE user_id = ?', [
      hashPassword(String(new_password)),
      req.user!.user_id,
    ]);

    await recordAuditLog(
      req.user!,
      'PASSWORD_CHANGED',
      'user',
      `#${req.user!.user_id}`,
      'Member updated account password.'
    );
    await createUserNotification(
      req.user!.user_id,
      'Security Notice: Password Updated',
      'Your PolicyPulse account password was updated successfully.',
      'Email'
    );

    res.json({ ok: true, message: 'Password updated successfully.' });
  })
);

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    if (req.sessionToken) {
      revokedTokens.add(req.sessionToken);
      await execute('DELETE FROM sessions WHERE token = ?', [req.sessionToken]);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/auth/me', (req: AuthedRequest, res) => {
  res.json({ user: req.user ?? null });
});

// --- Public Partner Hospitals Directory ---
app.get(
  '/api/hospitals',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const city = typeof req.query.city === 'string' ? req.query.city.trim() : '';

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (city && city !== 'All') {
      clauses.push('city = ?');
      params.push(city);
    }
    if (q) {
      clauses.push('(LOWER(hospital_name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(specialty) LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const hospitals = await queryAll(
      `SELECT * FROM partner_hospitals ${whereSql} ORDER BY hospital_id ASC`,
      params
    );

    res.json({ hospitals });
  })
);

// --- Policy Routes ---
app.get(
  '/api/policies',
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (category && category !== 'All') {
      clauses.push('category = ?');
      params.push(category);
    }
    if (q) {
      clauses.push(
        '(LOWER(policy_name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ? OR LOWER(highlights) LIKE ?)'
      );
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await queryAll(
      `SELECT * FROM policies ${whereSql} ORDER BY policy_id ASC`,
      params
    );

    res.json({ policies: rows });
  })
);

app.post(
  '/api/policies',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const payload = {
      policy_name: String(body.policy_name ?? '').trim(),
      category: String(body.category ?? '').trim(),
      description: String(body.description ?? '').trim(),
      premium_amount: Number(body.premium_amount),
      coverage_amount: Number(body.coverage_amount),
      term_months: Number(body.term_months || 12),
      highlights: String(body.highlights ?? '').trim(),
    };

    const check = validatePolicyInput(payload);
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const inserted = await execute(
      `INSERT INTO policies (policy_name, category, description, premium_amount, coverage_amount, term_months, highlights)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.policy_name,
        payload.category,
        payload.description,
        payload.premium_amount,
        payload.coverage_amount,
        payload.term_months,
        payload.highlights,
      ]
    );

    const policy = (await queryOne<PolicyRecord>(
      'SELECT * FROM policies WHERE policy_id = ?',
      [inserted.insertId]
    )) as PolicyRecord;

    await recordAuditLog(
      req.user!,
      'CREATE_POLICY',
      'policy',
      `#${policy.policy_id}`,
      `Created policy "${policy.policy_name}" (${policy.category}).`
    );

    res.status(201).json({ policy });
  })
);

app.put(
  '/api/policies/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid policy ID.' });
      return;
    }

    const existing = await queryOne('SELECT * FROM policies WHERE policy_id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }

    const body = req.body ?? {};
    const payload = {
      policy_name: String(body.policy_name ?? '').trim(),
      category: String(body.category ?? '').trim(),
      description: String(body.description ?? '').trim(),
      premium_amount: Number(body.premium_amount),
      coverage_amount: Number(body.coverage_amount),
      term_months: Number(body.term_months || 12),
      highlights: String(body.highlights ?? '').trim(),
    };

    const check = validatePolicyInput(payload);
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    await execute(
      `UPDATE policies
       SET policy_name = ?, category = ?, description = ?, premium_amount = ?, coverage_amount = ?, term_months = ?, highlights = ?
       WHERE policy_id = ?`,
      [
        payload.policy_name,
        payload.category,
        payload.description,
        payload.premium_amount,
        payload.coverage_amount,
        payload.term_months,
        payload.highlights,
        id,
      ]
    );

    const policy = (await queryOne<PolicyRecord>(
      'SELECT * FROM policies WHERE policy_id = ?',
      [id]
    )) as PolicyRecord;

    await recordAuditLog(
      req.user!,
      'UPDATE_POLICY',
      'policy',
      `#${id}`,
      `Updated policy "${policy.policy_name}".`
    );

    res.json({ policy });
  })
);

app.delete(
  '/api/policies/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid policy ID.' });
      return;
    }

    const linked = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM applications WHERE policy_id = ?',
      [id]
    );

    if (Number(linked?.count ?? 0) > 0) {
      res.status(409).json({
        error: `Cannot delete policy because ${linked?.count} customer application(s) reference it.`,
      });
      return;
    }

    const existing = await queryOne<{ policy_name: string }>(
      'SELECT policy_name FROM policies WHERE policy_id = ?',
      [id]
    );
    const result = await execute('DELETE FROM policies WHERE policy_id = ?', [id]);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Policy not found.' });
      return;
    }

    await recordAuditLog(
      req.user!,
      'DELETE_POLICY',
      'policy',
      `#${id}`,
      `Deleted policy "${existing?.policy_name ?? id}".`
    );

    res.json({ ok: true });
  })
);

// --- Application Routes ---
app.get(
  '/api/applications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (req.user!.role !== 'admin') {
      clauses.push('a.user_id = ?');
      params.push(req.user!.user_id);
    }
    if (statusFilter && statusFilter !== 'All') {
      clauses.push('a.status = ?');
      params.push(statusFilter);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await queryAll(
      `SELECT a.*,
              p.policy_name, p.category, p.premium_amount, p.coverage_amount, p.term_months,
              u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       JOIN users u ON u.user_id = a.user_id
       ${whereSql}
       ORDER BY a.application_id DESC`,
      params
    );

    res.json({ applications: rows });
  })
);

app.post(
  '/api/applications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const payload = {
      policy_id: Number(body.policy_id),
      applicant_age: Number(body.applicant_age),
      nominee_name: String(body.nominee_name ?? '').trim(),
      medical_notes: String(body.medical_notes ?? '').trim(),
    };

    const check = validateApplicationInput(payload);
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const policy = await queryOne<PolicyRecord>(
      'SELECT * FROM policies WHERE policy_id = ?',
      [payload.policy_id]
    );
    if (!policy) {
      res.status(404).json({ error: 'Selected policy does not exist.' });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const inserted = await execute(
      `INSERT INTO applications (user_id, policy_id, applicant_age, nominee_name, medical_notes, application_date, status, admin_notes)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', '')`,
      [
        req.user!.user_id,
        payload.policy_id,
        payload.applicant_age,
        payload.nominee_name,
        payload.medical_notes,
        today,
      ]
    );

    const created = (await queryOne<ApplicationRecord>(
      `SELECT a.*, p.policy_name, p.category, p.premium_amount, p.coverage_amount, p.term_months
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE a.application_id = ?`,
      [inserted.insertId]
    )) as ApplicationRecord;

    await createUserNotification(
      req.user!.user_id,
      `Application Received: ${policy.policy_name}`,
      `Application #${created.application_id} has been logged for administrative review.`,
      'Email'
    );
    await recordAuditLog(
      req.user!,
      'SUBMIT_APPLICATION',
      'application',
      `#${created.application_id}`,
      `Applied for "${policy.policy_name}" (Nominee: ${payload.nominee_name}).`
    );

    res.status(201).json({ application: created });
  })
);

app.patch(
  '/api/applications/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status, admin_notes = '' } = req.body ?? {};
    const allowed: ApplicationStatus[] = ['Pending', 'Approved', 'Rejected'];

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Status must be Pending, Approved, or Rejected.' });
      return;
    }

    const result = await execute(
      'UPDATE applications SET status = ?, admin_notes = ? WHERE application_id = ?',
      [status, String(admin_notes).trim(), id]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }

    const updated = (await queryOne<ApplicationRecord>(
      `SELECT a.*,
              p.policy_name, p.category, p.premium_amount, p.coverage_amount, p.term_months,
              u.full_name as customer_name, u.email as customer_email, u.phone as customer_phone
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       JOIN users u ON u.user_id = a.user_id
       WHERE a.application_id = ?`,
      [id]
    )) as ApplicationRecord;

    await createUserNotification(
      updated.user_id,
      `Application #${id} ${status}: ${updated.policy_name}`,
      admin_notes
        ? `Status updated to ${status}. Reviewer note: ${String(admin_notes).trim()}`
        : `Your policy application status is now ${status}.`,
      'Email'
    );
    await recordAuditLog(
      req.user!,
      'REVIEW_APPLICATION',
      'application',
      `#${id}`,
      `Marked application #${id} (${updated.policy_name}) as ${status}.`
    );

    res.json({ application: updated });
  })
);

// --- Claims Routes ---
app.get(
  '/api/claims',
  requireAuth,
  asyncHandler(async (req, res) => {
    const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (req.user!.role !== 'admin') {
      clauses.push('a.user_id = ?');
      params.push(req.user!.user_id);
    }
    if (statusFilter && statusFilter !== 'All') {
      clauses.push('c.status = ?');
      params.push(statusFilter);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await queryAll(
      `SELECT c.*,
              p.policy_name, p.coverage_amount,
              u.full_name as customer_name, u.email as customer_email
       FROM claims c
       JOIN applications a ON a.application_id = c.application_id
       JOIN policies p ON p.policy_id = a.policy_id
       JOIN users u ON u.user_id = a.user_id
       ${whereSql}
       ORDER BY c.claim_id DESC`,
      params
    );

    res.json({ claims: rows });
  })
);

app.post(
  '/api/claims',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const payload = {
      application_id: Number(body.application_id),
      claim_amount: Number(body.claim_amount),
      hospital_name: String(body.hospital_name ?? '').trim(),
      incident_date: String(body.incident_date ?? '').trim(),
      claim_details: String(body.claim_details ?? '').trim(),
    };

    const linkedApp = await queryOne<{
      application_id: number;
      user_id: number;
      status: ApplicationStatus;
      coverage_amount: number;
      policy_name: string;
    }>(
      `SELECT a.application_id, a.user_id, a.status, p.coverage_amount, p.policy_name
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE a.application_id = ?`,
      [payload.application_id]
    );

    if (!linkedApp || (req.user!.role !== 'admin' && linkedApp.user_id !== req.user!.user_id)) {
      res.status(404).json({ error: 'Selected policy application was not found in your account.' });
      return;
    }

    const check = validateClaimInput(payload, {
      status: linkedApp.status,
      coverage_amount: Number(linkedApp.coverage_amount),
    });
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const inserted = await execute(
      `INSERT INTO claims (application_id, claim_amount, hospital_name, incident_date, claim_details, claim_date, status, reviewer_notes)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', '')`,
      [
        payload.application_id,
        payload.claim_amount,
        payload.hospital_name,
        payload.incident_date,
        payload.claim_details,
        today,
      ]
    );

    const created = (await queryOne<ClaimRecord>(
      `SELECT c.*, p.policy_name, p.coverage_amount
       FROM claims c
       JOIN applications a ON a.application_id = c.application_id
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE c.claim_id = ?`,
      [inserted.insertId]
    )) as ClaimRecord;

    await createUserNotification(
      req.user!.user_id,
      `Claim #${created.claim_id} Submitted`,
      `Claim for $${payload.claim_amount} at ${payload.hospital_name} is now Pending review.`,
      'SMS'
    );
    await recordAuditLog(
      req.user!,
      'SUBMIT_CLAIM',
      'claim',
      `#${created.claim_id}`,
      `Submitted claim ($${payload.claim_amount}) under ${linkedApp.policy_name}.`
    );

    res.status(201).json({ claim: created });
  })
);

app.patch(
  '/api/claims/:id/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { status, reviewer_notes = '' } = req.body ?? {};
    const allowed: ClaimStatus[] = ['Pending', 'Under Review', 'Approved', 'Rejected'];

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid claim ID.' });
      return;
    }
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid claim status.' });
      return;
    }

    const result = await execute(
      'UPDATE claims SET status = ?, reviewer_notes = ? WHERE claim_id = ?',
      [status, String(reviewer_notes).trim(), id]
    );

    if (result.changes === 0) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }

    const updated = (await queryOne<ClaimRecord & { user_id: number }>(
      `SELECT c.*,
              a.user_id,
              p.policy_name, p.coverage_amount,
              u.full_name as customer_name, u.email as customer_email
       FROM claims c
       JOIN applications a ON a.application_id = c.application_id
       JOIN policies p ON p.policy_id = a.policy_id
       JOIN users u ON u.user_id = a.user_id
       WHERE c.claim_id = ?`,
      [id]
    )) as ClaimRecord & { user_id: number };

    await createUserNotification(
      updated.user_id,
      `Claim #${id} ${status}: ${updated.hospital_name}`,
      reviewer_notes
        ? `Claim status updated to ${status}. Reviewer note: ${String(reviewer_notes).trim()}`
        : `Your claim status is now ${status}.`,
      'SMS'
    );
    await recordAuditLog(
      req.user!,
      'REVIEW_CLAIM',
      'claim',
      `#${id}`,
      `Updated claim #${id} (${updated.hospital_name}) to ${status}.`
    );

    res.json({ claim: updated });
  })
);

app.get(
  '/api/claims/:id/notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const claimId = Number(req.params.id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      res.status(400).json({ error: 'Invalid claim ID.' });
      return;
    }

    const claimRow = await queryOne<{ claim_id: number; user_id: number }>(
      `SELECT c.claim_id, a.user_id
       FROM claims c
       JOIN applications a ON a.application_id = c.application_id
       WHERE c.claim_id = ?`,
      [claimId]
    );

    if (!claimRow || (req.user!.role !== 'admin' && claimRow.user_id !== req.user!.user_id)) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }

    const notes = await queryAll(
      'SELECT * FROM claim_notes WHERE claim_id = ? ORDER BY note_id DESC',
      [claimId]
    );
    res.json({ notes });
  })
);

app.post(
  '/api/claims/:id/notes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const claimId = Number(req.params.id);
    if (!Number.isInteger(claimId) || claimId <= 0) {
      res.status(400).json({ error: 'Invalid claim ID.' });
      return;
    }

    const claimRow = await queryOne<{
      claim_id: number;
      hospital_name: string;
      user_id: number;
    }>(
      `SELECT c.claim_id, c.hospital_name, a.user_id
       FROM claims c
       JOIN applications a ON a.application_id = c.application_id
       WHERE c.claim_id = ?`,
      [claimId]
    );

    if (!claimRow || (req.user!.role !== 'admin' && claimRow.user_id !== req.user!.user_id)) {
      res.status(404).json({ error: 'Claim not found.' });
      return;
    }

    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const noteBody = String(body.body ?? '').trim();
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).join(',')
      : String(body.tags ?? '').trim();

    const check = validateClaimNoteInput({ title, body: noteBody });
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const inserted = await execute(
      `INSERT INTO claim_notes (claim_id, author_name, author_role, title, body, tags)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [claimId, req.user!.full_name, req.user!.role, title, noteBody, tags]
    );

    const note = await queryOne('SELECT * FROM claim_notes WHERE note_id = ?', [
      inserted.insertId,
    ]);

    await recordAuditLog(
      req.user!,
      'ADD_CLAIM_NOTE',
      'claim',
      `#${claimId}`,
      `Added note "${title}" on claim #${claimId} (${claimRow.hospital_name}).`
    );

    res.status(201).json({ note });
  })
);

// --- Payments & Billing Routes ---
app.get(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (req.user!.role !== 'admin') {
      clauses.push('pay.user_id = ?');
      params.push(req.user!.user_id);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const payments = await queryAll(
      `SELECT pay.*,
              p.policy_name, p.category, p.coverage_amount,
              u.full_name as customer_name
       FROM payments pay
       JOIN applications a ON a.application_id = pay.application_id
       JOIN policies p ON p.policy_id = a.policy_id
       JOIN users u ON u.user_id = pay.user_id
       ${whereSql}
       ORDER BY pay.payment_id DESC`,
      params
    );

    res.json({ payments });
  })
);

app.post(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const payload = {
      application_id: Number(body.application_id),
      amount: Number(body.amount),
      payment_method: String(body.payment_method ?? 'Card') as PaymentMethod,
      account_identifier: String(body.account_identifier ?? '').trim(),
    };

    const check = validatePaymentInput(payload);
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const linkedApp = await queryOne<{
      application_id: number;
      user_id: number;
      status: ApplicationStatus;
      policy_name: string;
      category: string;
      coverage_amount: number;
    }>(
      `SELECT a.application_id, a.user_id, a.status, p.policy_name, p.category, p.coverage_amount
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE a.application_id = ?`,
      [payload.application_id]
    );

    if (!linkedApp || (req.user!.role !== 'admin' && linkedApp.user_id !== req.user!.user_id)) {
      res.status(404).json({ error: 'Selected policy application was not found in your account.' });
      return;
    }
    if (linkedApp.status !== 'Approved') {
      res
        .status(400)
        .json({ error: 'Premium payments can only be recorded for Approved policies.' });
      return;
    }

    const mask = maskAccountIdentifier(payload.payment_method, payload.account_identifier);
    const txRef = `TXN-IC-${Date.now().toString().slice(-6)}${crypto.randomInt(10, 99)}`;
    const today = new Date().toISOString().slice(0, 10);

    const inserted = await execute(
      `INSERT INTO payments (application_id, user_id, amount, payment_method, account_mask, transaction_ref, payment_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Paid')`,
      [
        payload.application_id,
        req.user!.user_id,
        payload.amount,
        payload.payment_method,
        mask,
        txRef,
        today,
      ]
    );

    const created = (await queryOne<PaymentRecord>(
      `SELECT pay.*, p.policy_name, p.category, p.coverage_amount
       FROM payments pay
       JOIN applications a ON a.application_id = pay.application_id
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE pay.payment_id = ?`,
      [inserted.insertId]
    )) as PaymentRecord;

    await createUserNotification(
      req.user!.user_id,
      `Payment Confirmed: ${txRef}`,
      `Demo premium payment of $${payload.amount} for ${linkedApp.policy_name} (${mask}) was recorded.`,
      'Email'
    );
    await recordAuditLog(
      req.user!,
      'PAYMENT_RECORDED',
      'payment',
      txRef,
      `Paid $${payload.amount} for ${linkedApp.policy_name} via ${mask}.`
    );

    res.status(201).json({ payment: created });
  })
);

// --- Notifications Routes ---
app.get(
  '/api/notifications',
  requireAuth,
  asyncHandler(async (req, res) => {
    const notifications = await queryAll(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY notification_id DESC LIMIT 40',
      [req.user!.user_id]
    );
    const unreadRow = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user!.user_id]
    );

    res.json({ notifications, unreadCount: Number(unreadRow?.count ?? 0) });
  })
);

app.patch(
  '/api/notifications/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await execute('UPDATE notifications SET is_read = 1 WHERE notification_id = ? AND user_id = ?', [
      id,
      req.user!.user_id,
    ]);
    res.json({ ok: true });
  })
);

app.patch(
  '/api/notifications/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user!.user_id]);
    res.json({ ok: true });
  })
);

// --- Admin Overview, Analytics & Audit Logs ---
app.get(
  '/api/admin/overview',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [
      customerRow,
      policyRow,
      pendingRow,
      approvedRow,
      openClaimsRow,
      volumeRow,
      rawCustomers,
      inquiries,
    ] = await Promise.all([
      queryOne<{ count: number }>("SELECT COUNT(*) as count FROM users WHERE role = 'customer'"),
      queryOne<{ count: number }>('SELECT COUNT(*) as count FROM policies'),
      queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM applications WHERE status = 'Pending'"
      ),
      queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM applications WHERE status = 'Approved'"
      ),
      queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM claims WHERE status IN ('Pending', 'Under Review')"
      ),
      queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(p.coverage_amount), 0) as total
         FROM applications a
         JOIN policies p ON p.policy_id = a.policy_id
         WHERE a.status = 'Approved'`
      ),
      queryAll<{
        user_id: number;
        full_name: string;
        email: string;
        phone: string;
        created_at: string;
        application_count: number;
        active_policies: number;
      }>(
        `SELECT u.user_id, u.full_name, u.email, u.phone, u.created_at,
                COUNT(DISTINCT a.application_id) as application_count,
                SUM(CASE WHEN a.status = 'Approved' THEN 1 ELSE 0 END) as active_policies
         FROM users u
         LEFT JOIN applications a ON a.user_id = u.user_id
         WHERE u.role = 'customer'
         GROUP BY u.user_id, u.full_name, u.email, u.phone, u.created_at
         ORDER BY u.user_id DESC`
      ),
      queryAll('SELECT * FROM lead_inquiries ORDER BY inquiry_id DESC LIMIT 20'),
    ]);

    const customers = rawCustomers.map((c) => ({
      ...c,
      application_count: Number(c.application_count ?? 0),
      active_policies: Number(c.active_policies ?? 0),
    }));

    res.json({
      stats: {
        customerCount: Number(customerRow?.count ?? 0),
        policyCount: Number(policyRow?.count ?? 0),
        pendingAppsCount: Number(pendingRow?.count ?? 0),
        approvedAppsCount: Number(approvedRow?.count ?? 0),
        openClaimsCount: Number(openClaimsRow?.count ?? 0),
        activeCoverageVolume: Number(volumeRow?.total ?? 0),
      },
      customers,
      inquiries,
    });
  })
);

app.get(
  '/api/admin/analytics',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [policies, applications, claims, payments] = await Promise.all([
      queryAll<PolicyRecord>('SELECT * FROM policies'),
      queryAll<ApplicationRecord>(
        `SELECT a.*, p.category, p.policy_name
         FROM applications a
         JOIN policies p ON p.policy_id = a.policy_id`
      ),
      queryAll<ClaimRecord>('SELECT * FROM claims'),
      queryAll<PaymentRecord>('SELECT * FROM payments'),
    ]);

    const analytics = computeAdminAnalytics(policies, applications, claims, payments);
    res.json({ analytics });
  })
);

app.get(
  '/api/admin/audit-logs',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const whereSql = q
      ? 'WHERE LOWER(actor_name) LIKE ? OR LOWER(action) LIKE ? OR LOWER(details) LIKE ?'
      : '';
    const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const logs = await queryAll(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY log_id DESC LIMIT 100`,
      params
    );
    res.json({ logs });
  })
);

// --- Public Quote / Callback Inquiry ---
app.post(
  '/api/inquiries',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const payload = {
      full_name: String(body.full_name ?? '').trim(),
      email: String(body.email ?? '').trim(),
      phone: String(body.phone ?? '').trim(),
      preferred_category: String(body.preferred_category ?? '').trim(),
      message: String(body.message ?? '').trim(),
    };

    const check = validateInquiryInput(payload);
    if (!check.valid) {
      res.status(400).json({ error: Object.values(check.errors)[0], errors: check.errors });
      return;
    }

    const inserted = await execute(
      `INSERT INTO lead_inquiries (full_name, email, phone, preferred_category, message)
       VALUES (?, ?, ?, ?, ?)`,
      [
        payload.full_name,
        payload.email,
        payload.phone,
        payload.preferred_category,
        payload.message,
      ]
    );

    res.status(201).json({
      inquiry_id: inserted.insertId,
      message: 'Your coverage inquiry has been received. An advisor will follow up shortly.',
    });
  })
);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
);

let initPromise: Promise<void> | null = null;

export function ensureBackendReady(): Promise<void> {
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      if (isProductionDeploy && SESSION_SECRET.length < 32) {
        throw new Error(
          'Production requires a SESSION_SECRET with at least 32 characters.'
        );
      }
      return initDatabase();
    })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

app.get('/insurecare-project.zip', (_req, res) => {
  const zipPath = path.resolve(process.cwd(), 'public', 'insurecare-project.zip');
  const distZipPath = path.resolve(process.cwd(), 'dist', 'insurecare-project.zip');
  const targetPath = fs.existsSync(zipPath) ? zipPath : distZipPath;
  if (!fs.existsSync(targetPath)) {
    res.status(404).send('Project archive not found.');
    return;
  }
  res.download(targetPath, 'insurecare-project.zip');
});

async function startServer() {
  await ensureBackendReady();

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd && !process.env.VERCEL) {
    const vitePkg = 'vite';
    const { createServer: createViteServer } = await import(vitePkg);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PolicyPulse server listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start PolicyPulse server:', err);
    process.exit(1);
  });
}
