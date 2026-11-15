import 'dotenv/config';
import type { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import path from 'node:path';

const rawMySqlHost = process.env.MYSQL_HOST?.trim() || '';
const isProductionDeploy =
  Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
const isLocalHostOnVercel =
  Boolean(process.env.VERCEL) &&
  (rawMySqlHost === '127.0.0.1' || rawMySqlHost === 'localhost');

export const isMySqlMode = Boolean(
  !isLocalHostOnVercel && (rawMySqlHost || process.env.DB_CLIENT === 'mysql')
);

let sqliteDb: DatabaseSync | null = null;
let mysqlPool: mysql.Pool | null = null;

async function getSqliteDb(): Promise<DatabaseSync> {
  if (!sqliteDb) {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = path.resolve(process.cwd(), 'insurecare.db');
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
  }
  return sqliteDb;
}

function getMySqlConfig() {
  return {
    host: process.env.MYSQL_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER?.trim() || 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE?.trim() || 'insurecare',
  };
}

function getMySqlPool(): mysql.Pool {
  if (!mysqlPool) {
    const cfg = getMySqlConfig();
    mysqlPool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      waitForConnections: true,
      connectionLimit: 10,
      decimalNumbers: true,
      dateStrings: true,
    });
  }
  return mysqlPool;
}

export async function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): Promise<T[]> {
  if (isMySqlMode) {
    const [rows] = await getMySqlPool().execute<mysql.RowDataPacket[]>(sql, params);
    return rows as T[];
  }
  const db = await getSqliteDb();
  return db
    .prepare(sql)
    .all(...params) as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: Array<string | number | null> = []
): Promise<T | undefined> {
  if (isMySqlMode) {
    const rows = await queryAll<T>(sql, params);
    return rows[0];
  }
  const db = await getSqliteDb();
  return db
    .prepare(sql)
    .get(...params) as T | undefined;
}

export async function execute(
  sql: string,
  params: Array<string | number | null> = []
): Promise<{ insertId: number; changes: number }> {
  if (isMySqlMode) {
    const [result] = await getMySqlPool().execute<mysql.ResultSetHeader>(sql, params);
    return {
      insertId: Number(result.insertId || 0),
      changes: Number(result.affectedRows || 0),
    };
  }
  const db = await getSqliteDb();
  const info = db
    .prepare(sql)
    .run(...params);
  return {
    insertId: Number(info.lastInsertRowid || 0),
    changes: Number(info.changes || 0),
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

async function initMySqlTables() {
  const pool = getMySqlPool();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      phone VARCHAR(40) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS policies (
      policy_id INT AUTO_INCREMENT PRIMARY KEY,
      policy_name VARCHAR(180) NOT NULL,
      category VARCHAR(100) NOT NULL,
      description TEXT NOT NULL,
      premium_amount DECIMAL(10,2) NOT NULL,
      coverage_amount DECIMAL(12,2) NOT NULL,
      term_months INT NOT NULL DEFAULT 12,
      highlights VARCHAR(500) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS applications (
      application_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      policy_id INT NOT NULL,
      applicant_age INT NOT NULL,
      nominee_name VARCHAR(150) NOT NULL,
      medical_notes TEXT NOT NULL,
      application_date VARCHAR(20) NOT NULL,
      status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
      admin_notes TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (policy_id) REFERENCES policies(policy_id) ON DELETE RESTRICT
    )`,
    `CREATE TABLE IF NOT EXISTS claims (
      claim_id INT AUTO_INCREMENT PRIMARY KEY,
      application_id INT NOT NULL,
      claim_amount DECIMAL(10,2) NOT NULL,
      hospital_name VARCHAR(180) NOT NULL,
      incident_date VARCHAR(20) NOT NULL,
      claim_details TEXT NOT NULL,
      claim_date VARCHAR(20) NOT NULL,
      status ENUM('Pending', 'Under Review', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
      reviewer_notes TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      expires_at VARCHAR(40) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS lead_inquiries (
      inquiry_id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(150) NOT NULL,
      email VARCHAR(190) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      preferred_category VARCHAR(100) NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      payment_id INT AUTO_INCREMENT PRIMARY KEY,
      application_id INT NOT NULL,
      user_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method ENUM('Card', 'Bank ACH', 'UPI') NOT NULL,
      account_mask VARCHAR(100) NOT NULL,
      transaction_ref VARCHAR(120) NOT NULL UNIQUE,
      payment_date VARCHAR(20) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'Paid',
      FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      notification_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(180) NOT NULL,
      message TEXT NOT NULL,
      channel ENUM('In-App', 'Email', 'SMS') NOT NULL DEFAULT 'In-App',
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      actor_user_id INT NULL,
      actor_name VARCHAR(150) NOT NULL,
      actor_role VARCHAR(40) NOT NULL,
      action VARCHAR(80) NOT NULL,
      target_type VARCHAR(60) NOT NULL,
      target_id VARCHAR(60) NOT NULL,
      details TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS partner_hospitals (
      hospital_id INT AUTO_INCREMENT PRIMARY KEY,
      hospital_name VARCHAR(180) NOT NULL,
      city VARCHAR(100) NOT NULL,
      specialty VARCHAR(180) NOT NULL,
      cashless_desk TINYINT(1) NOT NULL DEFAULT 1,
      emergency_phone VARCHAR(40) NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS claim_notes (
      note_id INT AUTO_INCREMENT PRIMARY KEY,
      claim_id INT NOT NULL,
      author_name VARCHAR(150) NOT NULL,
      author_role ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      tags VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
    )`,
  ];

  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

async function initSqliteTables() {
  const db = await getSqliteDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'admin')) DEFAULT 'customer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policies (
      policy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      premium_amount REAL NOT NULL,
      coverage_amount REAL NOT NULL,
      term_months INTEGER NOT NULL DEFAULT 12,
      highlights TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS applications (
      application_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      policy_id INTEGER NOT NULL,
      applicant_age INTEGER NOT NULL,
      nominee_name TEXT NOT NULL,
      medical_notes TEXT NOT NULL DEFAULT '',
      application_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
      admin_notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
      FOREIGN KEY (policy_id) REFERENCES policies(policy_id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS claims (
      claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      claim_amount REAL NOT NULL,
      hospital_name TEXT NOT NULL,
      incident_date TEXT NOT NULL,
      claim_details TEXT NOT NULL,
      claim_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Under Review', 'Approved', 'Rejected')) DEFAULT 'Pending',
      reviewer_notes TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lead_inquiries (
      inquiry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      preferred_category TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('Card', 'Bank ACH', 'UPI')),
      account_mask TEXT NOT NULL,
      transaction_ref TEXT NOT NULL UNIQUE,
      payment_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Paid',
      FOREIGN KEY (application_id) REFERENCES applications(application_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('In-App', 'Email', 'SMS')) DEFAULT 'In-App',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_hospitals (
      hospital_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_name TEXT NOT NULL,
      city TEXT NOT NULL,
      specialty TEXT NOT NULL,
      cashless_desk INTEGER NOT NULL DEFAULT 1,
      emergency_phone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claim_notes (
      note_id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL CHECK(author_role IN ('customer', 'admin')) DEFAULT 'customer',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (claim_id) REFERENCES claims(claim_id) ON DELETE CASCADE
    );
  `);
}

export async function initDatabase() {
  if (
    isProductionDeploy &&
    (!process.env.OWNER_EMAIL?.trim() ||
      (process.env.OWNER_PASSWORD?.trim().length ?? 0) < 12)
  ) {
    throw new Error(
      'Production requires OWNER_EMAIL and an OWNER_PASSWORD of at least 12 characters for the initial administrator account.'
    );
  }

  if (
    process.env.VERCEL &&
    (!rawMySqlHost ||
      isLocalHostOnVercel ||
      !process.env.MYSQL_USER?.trim() ||
      !process.env.MYSQL_PASSWORD ||
      !process.env.MYSQL_DATABASE?.trim())
  ) {
    throw new Error(
      'Vercel requires a persistent MySQL database. Configure MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE; MYSQL_PORT defaults to 3306.'
    );
  }

  if (isMySqlMode) {
    await initMySqlTables();
    console.log(
      `Connected to MySQL database "${getMySqlConfig().database}" at ${getMySqlConfig().host}:${getMySqlConfig().port}`
    );
  } else {
    await initSqliteTables();
  }

  const userCountRow = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!isProductionDeploy && Number(userCountRow?.count ?? 0) === 0) {
    await seedInitialData();
  }

  if (isProductionDeploy) {
    const policyCountRow = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM policies'
    );
    if (Number(policyCountRow?.count ?? 0) === 0) {
      await seedInitialPolicies();
    }
  }

  if (!isProductionDeploy) {
    await seedSuggestiveModulesIfNeeded();
  }

  await ensureOwnerAccount();
}

async function ensureOwnerAccount() {
  const ownerEmail =
    process.env.OWNER_EMAIL?.trim().toLowerCase() ||
    (isProductionDeploy ? '' : 'lahaayan864@gmail.com');
  const ownerName = process.env.OWNER_NAME?.trim() || (isProductionDeploy ? 'Administrator' : 'Ayan Laha');
  const ownerPhone = process.env.OWNER_PHONE?.trim() || '+1 415 800 9001';
  const ownerPass =
    process.env.OWNER_PASSWORD || (isProductionDeploy ? '' : 'Ayanlaha@123');

  if (!ownerEmail || !ownerPass || (isProductionDeploy && ownerPass.trim().length < 12)) {
    throw new Error(
      'Set OWNER_EMAIL and an OWNER_PASSWORD of at least 12 characters to create the initial administrator account.'
    );
  }

  const existing = await queryOne<{
    user_id: number;
    full_name: string;
    role: string;
  }>(
    'SELECT user_id, full_name, role FROM users WHERE LOWER(email) = ?',
    [ownerEmail]
  );

  if (!existing) {
    await execute(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [ownerName, ownerEmail, ownerPhone, hashPassword(ownerPass), 'admin']
    );
    return;
  }

  if (existing.role !== 'admin' || existing.full_name !== ownerName) {
    await execute('UPDATE users SET full_name = ?, role = ? WHERE user_id = ?', [
      ownerName,
      'admin',
      existing.user_id,
    ]);
  }
}

async function seedInitialPolicies() {
  const insertPolicySql = `INSERT INTO policies (policy_name, category, description, premium_amount, coverage_amount, term_months, highlights)
     VALUES (?, ?, ?, ?, ?, ?, ?)`;

  const p1 = await execute(insertPolicySql, [
    'Essential Care Individual',
    'Individual Health',
    'Hospitalization, day-care procedures, emergency ambulance, and annual preventive health checkups with zero co-pay at network clinics.',
    89,
    100000,
    12,
    'Cashless hospitalization · Annual wellness exam · 24/7 telehealth visits',
  ]);
  const p2 = await execute(insertPolicySql, [
    'Family Floater Shield',
    'Family Floater',
    'Shared annual coverage pool for two adults and up to three children, including pediatric care, diagnostic imaging, and outpatient specialist consults.',
    210,
    300000,
    12,
    'Covers up to 5 family members · Maternity rider option · No-claim bonus up to 50%',
  ]);
  const p3 = await execute(insertPolicySql, [
    'Senior Care Platinum',
    'Senior Care',
    'Tailored inpatient and post-hospitalization recovery coverage for adults aged 60+, featuring home nursing support and chronic care management.',
    265,
    250000,
    12,
    'Home recovery visits · Cardiac & orthopedic cover · Priority cashless desk',
  ]);
  const p4 = await execute(insertPolicySql, [
    'Critical Illness Guardian',
    'Critical Illness',
    'Lump-sum and treatment reimbursement protection covering 32 major critical conditions including oncology, stroke, and bypass surgery.',
    145,
    500000,
    24,
    'Lump-sum payout on diagnosis · Second-opinion board · Global specialist network',
  ]);
  await execute(insertPolicySql, [
    'Maternity & Newborn Care',
    'Maternity & Newborn',
    'Complete prenatal checkups, delivery expenses, and day-one newborn coverage including pediatric vaccinations for the first 12 months.',
    175,
    150000,
    12,
    'Day-1 newborn coverage · Prenatal & postnatal visits · Private suite allowance',
  ]);
  const p6 = await execute(insertPolicySql, [
    'Preventive Dental & Vision',
    'Preventive Care',
    'Routine cleanings, restorative dental procedures, prescription eyewear allowance, and annual optometry screenings.',
    48,
    25000,
    12,
    'Two free cleanings yearly · $400 annual eyewear credit · Zero waiting period',
  ]);

  return { p1, p2, p3, p4, p6 };
}

async function seedInitialData() {
  await execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ['Elena Vance (Admin)', 'admin@insurecare.com', '+1 415 800 1001', hashPassword('Admin@123'), 'admin']
  );
  const aaravRes = await execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ['Aarav Sharma', 'aarav@insurecare.com', '+1 415 800 2410', hashPassword('Customer@123'), 'customer']
  );
  const priyaRes = await execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ['Priya Menon', 'priya@insurecare.com', '+1 415 800 3982', hashPassword('Customer@123'), 'customer']
  );
  const danielRes = await execute(
    'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    ['Daniel Brooks', 'daniel@insurecare.com', '+1 415 800 4711', hashPassword('Customer@123'), 'customer']
  );

  const { p1, p2, p3, p4, p6 } = await seedInitialPolicies();

  const insertAppSql = `INSERT INTO applications (user_id, policy_id, applicant_age, nominee_name, medical_notes, application_date, status, admin_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  const app1 = await execute(insertAppSql, [
    aaravRes.insertId,
    p2.insertId,
    34,
    'Kavya Sharma',
    'Non-smoker, regular annual physicals normal.',
    '2026-08-14',
    'Approved',
    'Verified applicant details and medical history. Active coverage issued.',
  ]);
  await execute(insertAppSql, [
    aaravRes.insertId,
    p6.insertId,
    34,
    'Kavya Sharma',
    'Routine preventive dental & vision add-on.',
    '2026-11-04',
    'Pending',
    'Queued for routine eligibility confirmation.',
  ]);
  const app3 = await execute(insertAppSql, [
    priyaRes.insertId,
    p1.insertId,
    29,
    'Arjun Menon',
    'No pre-existing conditions reported.',
    '2026-09-19',
    'Approved',
    'Approved after initial document verification.',
  ]);
  await execute(insertAppSql, [
    danielRes.insertId,
    p3.insertId,
    64,
    'Claire Brooks',
    'Controlled mild hypertension on daily medication.',
    '2026-10-28',
    'Pending',
    'Awaiting senior underwriter review.',
  ]);
  await execute(insertAppSql, [
    danielRes.insertId,
    p4.insertId,
    64,
    'Claire Brooks',
    'Requested 24-month critical illness rider.',
    '2026-09-02',
    'Rejected',
    'Age threshold for standalone 24-month critical tier exceeded; recommended Senior Care Platinum.',
  ]);

  const insertClaimSql = `INSERT INTO claims (application_id, claim_amount, hospital_name, incident_date, claim_details, claim_date, status, reviewer_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  await execute(insertClaimSql, [
    app1.insertId,
    1850,
    'Pacific Coast Medical Center',
    '2026-09-22',
    'Outpatient orthopedic imaging (MRI) and sports physiotherapy sessions following knee sprain.',
    '2026-09-25',
    'Approved',
    'Invoices verified against network fee schedule. Reimbursement cleared.',
  ]);
  await execute(insertClaimSql, [
    app1.insertId,
    920,
    'Bayview Diagnostic Clinic',
    '2026-11-03',
    'Pediatric ear infection consultation, rapid culture diagnostics, and prescription medications.',
    '2026-11-06',
    'Under Review',
    'Claims specialist verifying itemized clinic receipt.',
  ]);
  await execute(insertClaimSql, [
    app3.insertId,
    3400,
    'St. Helena Regional Hospital',
    '2026-10-18',
    'Emergency day-care laparoscopic procedure and post-operative recovery ward charges.',
    '2026-10-21',
    'Pending',
    'Submitted by member; awaiting hospital discharge summary verification.',
  ]);
}

async function seedSuggestiveModulesIfNeeded() {
  const hospitalCountRow = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM partner_hospitals'
  );

  if (Number(hospitalCountRow?.count ?? 0) === 0) {
    const sql =
      'INSERT INTO partner_hospitals (hospital_name, city, specialty, cashless_desk, emergency_phone) VALUES (?, ?, ?, ?, ?)';
    const rows: Array<[string, string, string, number, string]> = [
      ['Pacific Coast Medical Center', 'San Francisco', 'Multi-Specialty & Orthopedics', 1, '+1 415 555 8100'],
      ['Bayview Diagnostic Clinic', 'Oakland', 'Pediatrics & Diagnostics', 1, '+1 510 555 4420'],
      ['St. Helena Regional Hospital', 'Napa Valley', 'Emergency Surgery & Trauma', 1, '+1 707 555 2910'],
      ['Cedar Valley Heart Institute', 'San Jose', 'Cardiology & Critical Care', 1, '+1 408 555 6200'],
      ['Oakridge Maternity & Pediatrics', 'Palo Alto', 'Maternity, Neonatal & Women Health', 1, '+1 650 555 3180'],
      ['Harborview Senior Wellness Center', 'Sacramento', 'Geriatric Care & Rehabilitation', 1, '+1 916 555 7490'],
    ];
    for (const r of rows) {
      await execute(sql, r);
    }
  }

  const paymentCountRow = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM payments'
  );
  if (Number(paymentCountRow?.count ?? 0) === 0) {
    const aaravApp = await queryOne<{
      application_id: number;
      user_id: number;
      premium_amount: number;
    }>(
      `SELECT a.application_id, a.user_id, p.premium_amount
       FROM applications a
       JOIN policies p ON p.policy_id = a.policy_id
       WHERE a.status = 'Approved'
       ORDER BY a.application_id ASC LIMIT 1`
    );

    if (aaravApp) {
      await execute(
        `INSERT INTO payments (application_id, user_id, amount, payment_method, account_mask, transaction_ref, payment_date, status)
         VALUES (?, ?, ?, 'Card', 'Card •••• 4242', 'TXN-IC-20260815', '2026-08-15', 'Paid')`,
        [aaravApp.application_id, aaravApp.user_id, aaravApp.premium_amount]
      );
    }
  }

  const notifCountRow = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM notifications'
  );
  if (Number(notifCountRow?.count ?? 0) === 0) {
    const aarav = await queryOne<{ user_id: number }>(
      "SELECT user_id FROM users WHERE email = 'aarav@insurecare.com'"
    );
    if (aarav) {
      const sql =
        'INSERT INTO notifications (user_id, title, message, channel, is_read) VALUES (?, ?, ?, ?, ?)';
      await execute(sql, [
        aarav.user_id,
        'Policy Approved: Family Floater Shield',
        'Your policy application has been approved. You can now download your policy summary or submit claims.',
        'Email',
        1,
      ]);
      await execute(sql, [
        aarav.user_id,
        'Claim Settled: Pacific Coast Medical Center',
        'Claim #1 for $1,850 has been approved and marked for reimbursement.',
        'SMS',
        0,
      ]);
      await execute(sql, [
        aarav.user_id,
        'Claim Under Review: Bayview Diagnostic Clinic',
        'A claims specialist is reviewing itemized receipts for Claim #2 ($920).',
        'In-App',
        0,
      ]);
    }
  }

  const auditCountRow = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM audit_logs'
  );
  if (Number(auditCountRow?.count ?? 0) === 0) {
    const sql =
      'INSERT INTO audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)';
    await execute(sql, [
      1,
      'Elena Vance (Admin)',
      'admin',
      'APPROVE_APPLICATION',
      'application',
      '#1',
      'Verified applicant details and activated Family Floater Shield.',
    ]);
    await execute(sql, [
      1,
      'Elena Vance (Admin)',
      'admin',
      'APPROVE_CLAIM',
      'claim',
      '#1',
      'Verified MRI invoice ($1,850) against Pacific Coast Medical Center schedule.',
    ]);
    await execute(sql, [
      2,
      'Aarav Sharma',
      'customer',
      'PAYMENT_RECORDED',
      'payment',
      'TXN-IC-20260815',
      'Recorded initial monthly premium payment ($210) via Card •••• 4242.',
    ]);
  }

  const noteCountRow = await queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM claim_notes'
  );
  if (Number(noteCountRow?.count ?? 0) === 0) {
    const existingClaims = await queryAll<{
      claim_id: number;
      hospital_name: string;
      status: string;
    }>('SELECT claim_id, hospital_name, status FROM claims ORDER BY claim_id ASC LIMIT 3');

    const sql =
      'INSERT INTO claim_notes (claim_id, author_name, author_role, title, body, tags) VALUES (?, ?, ?, ?, ?, ?)';
    for (const cl of existingClaims) {
      await execute(sql, [
        cl.claim_id,
        'Elena Vance (Admin)',
        'admin',
        'Medical Expenses & Coding Check',
        `Hospital billing statement from ${cl.hospital_name} logged for schedule verification.`,
        'Verification,Billing',
      ]);
      if (cl.status !== 'Approved') {
        await execute(sql, [
          cl.claim_id,
          'Aarav Sharma',
          'customer',
          'Hospital Discharge Report',
          'Original outpatient consultation summary and pharmacy receipt attached in member portal.',
          'Documents',
        ]);
      }
    }
  }
}
