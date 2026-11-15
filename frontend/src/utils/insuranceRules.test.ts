import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegistrationInput,
  validatePolicyInput,
  validateApplicationInput,
  validateClaimInput,
  validateInquiryInput,
  validatePaymentInput,
  validateClaimNoteInput,
  getClaimProgress,
  calculateEstimatedPremium,
  maskAccountIdentifier,
  computeCustomerSummary,
  computeAdminAnalytics,
  computeClaimsBillSummary,
  formatCurrency,
} from './insuranceRules';

test('validateRegistrationInput rejects invalid email and short password', () => {
  const res = validateRegistrationInput({
    full_name: 'A',
    email: 'not-an-email',
    phone: '123',
    password: '123',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.full_name);
  assert.ok(res.errors.email);
  assert.ok(res.errors.phone);
  assert.ok(res.errors.password);
});

test('validateRegistrationInput accepts valid customer details', () => {
  const res = validateRegistrationInput({
    full_name: 'Meera Nair',
    email: 'meera.nair@example.com',
    phone: '+1 415 555 0192',
    password: 'SecurePass99',
  });
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, {});
});

test('validatePolicyInput enforces coverage >= premium and positive values', () => {
  const invalid = validatePolicyInput({
    policy_name: 'Care Plus',
    category: 'Individual Health',
    description: 'Comprehensive hospital and outpatient coverage for individuals.',
    premium_amount: 500,
    coverage_amount: 200,
    term_months: 12,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.coverage_amount);

  const valid = validatePolicyInput({
    policy_name: 'Care Plus',
    category: 'Individual Health',
    description: 'Comprehensive hospital and outpatient coverage for individuals.',
    premium_amount: 145,
    coverage_amount: 100000,
    term_months: 12,
  });
  assert.equal(valid.valid, true);
});

test('validateApplicationInput checks age boundaries and nominee', () => {
  const underage = validateApplicationInput({
    policy_id: 1,
    applicant_age: 16,
    nominee_name: 'Ravi Patel',
  });
  assert.equal(underage.valid, false);
  assert.ok(underage.errors.applicant_age);

  const ok = validateApplicationInput({
    policy_id: 1,
    applicant_age: 34,
    nominee_name: 'Ravi Patel',
  });
  assert.equal(ok.valid, true);
});

test('validateClaimInput blocks claims on non-approved policies or above coverage', () => {
  const pendingBlocked = validateClaimInput(
    {
      application_id: 2,
      claim_amount: 1200,
      hospital_name: 'St. Jude Medical Center',
      incident_date: '2026-10-01',
      claim_details: 'Emergency appendectomy and overnight inpatient observation.',
    },
    { status: 'Pending', coverage_amount: 50000 },
    '2026-11-13'
  );
  assert.equal(pendingBlocked.valid, false);
  assert.ok(pendingBlocked.errors.application_id);

  const overCoverage = validateClaimInput(
    {
      application_id: 2,
      claim_amount: 60000,
      hospital_name: 'St. Jude Medical Center',
      incident_date: '2026-10-01',
      claim_details: 'Major cardiac intervention and postoperative ICU stay.',
    },
    { status: 'Approved', coverage_amount: 50000 },
    '2026-11-13'
  );
  assert.equal(overCoverage.valid, false);
  assert.ok(overCoverage.errors.claim_amount);

  const futureDate = validateClaimInput(
    {
      application_id: 2,
      claim_amount: 2400,
      hospital_name: 'St. Jude Medical Center',
      incident_date: '2027-01-01',
      claim_details: 'Diagnostic MRI and orthopedic consultation.',
    },
    { status: 'Approved', coverage_amount: 50000 },
    '2026-11-13'
  );
  assert.equal(futureDate.valid, false);
  assert.ok(futureDate.errors.incident_date);

  const validClaim = validateClaimInput(
    {
      application_id: 2,
      claim_amount: 2400,
      hospital_name: 'St. Jude Medical Center',
      incident_date: '2026-10-15',
      claim_details: 'Diagnostic MRI and orthopedic specialist outpatient consultation.',
    },
    { status: 'Approved', coverage_amount: 50000 },
    '2026-11-13'
  );
  assert.equal(validClaim.valid, true);
});

test('validateInquiryInput checks required lead fields', () => {
  const res = validateInquiryInput({
    full_name: 'Kiran Rao',
    email: 'kiran@example.com',
    phone: '+1 555 234 9981',
    preferred_category: 'Family Floater',
  });
  assert.equal(res.valid, true);
});

test('validatePaymentInput validates Card, Bank ACH, and UPI identifiers', () => {
  const badCard = validatePaymentInput({
    application_id: 1,
    amount: 210,
    payment_method: 'Card',
    account_identifier: '1234',
  });
  assert.equal(badCard.valid, false);
  assert.ok(badCard.errors.account_identifier);

  const goodCard = validatePaymentInput({
    application_id: 1,
    amount: 210,
    payment_method: 'Card',
    account_identifier: '4242 4242 4242 4242',
  });
  assert.equal(goodCard.valid, true);
  assert.equal(maskAccountIdentifier('Card', '4242 4242 4242 4242'), 'Card •••• 4242');

  const goodUpi = validatePaymentInput({
    application_id: 1,
    amount: 210,
    payment_method: 'UPI',
    account_identifier: 'aarav@okbank',
  });
  assert.equal(goodUpi.valid, true);
});

test('calculateEstimatedPremium scales smoothly by age bracket and household size', () => {
  assert.equal(calculateEstimatedPremium(100, 28, 1), 100);
  assert.equal(calculateEstimatedPremium(100, 62, 1), 145);
  assert.equal(calculateEstimatedPremium(100, 36, 3), Math.round(100 * 1.08 * 1.84));
});

test('computeCustomerSummary aggregates approved coverage, premiums, and claims', () => {
  const summary = computeCustomerSummary(
    [
      {
        application_id: 1,
        user_id: 2,
        policy_id: 1,
        applicant_age: 32,
        nominee_name: 'Priya',
        medical_notes: '',
        application_date: '2026-09-01',
        status: 'Approved',
        premium_amount: 180,
        coverage_amount: 150000,
      },
      {
        application_id: 2,
        user_id: 2,
        policy_id: 3,
        applicant_age: 32,
        nominee_name: 'Priya',
        medical_notes: '',
        application_date: '2026-11-01',
        status: 'Pending',
        premium_amount: 95,
        coverage_amount: 75000,
      },
    ],
    [
      {
        claim_id: 10,
        application_id: 1,
        claim_amount: 1450,
        hospital_name: 'Mercy General',
        incident_date: '2026-10-12',
        claim_details: 'Outpatient diagnostics',
        claim_date: '2026-10-14',
        status: 'Approved',
      },
      {
        claim_id: 11,
        application_id: 1,
        claim_amount: 820,
        hospital_name: 'Mercy General',
        incident_date: '2026-11-05',
        claim_details: 'Follow-up lab work',
        claim_date: '2026-11-06',
        status: 'Under Review',
      },
    ]
  );

  assert.equal(summary.activePoliciesCount, 1);
  assert.equal(summary.pendingApplicationsCount, 1);
  assert.equal(summary.totalCoverage, 150000);
  assert.equal(summary.monthlyPremium, 180);
  assert.equal(summary.openClaimsCount, 1);
  assert.equal(summary.approvedClaimTotal, 1450);
  assert.equal(formatCurrency(150000), '$150,000');
});

test('computeAdminAnalytics summarizes category breakdown and revenue', () => {
  const analytics = computeAdminAnalytics(
    [
      {
        policy_id: 1,
        policy_name: 'Essential',
        category: 'Individual Health',
        description: 'Desc',
        premium_amount: 89,
        coverage_amount: 100000,
        term_months: 12,
        highlights: '',
      },
    ],
    [
      {
        application_id: 1,
        user_id: 2,
        policy_id: 1,
        category: 'Individual Health',
        applicant_age: 30,
        nominee_name: 'Nom',
        medical_notes: '',
        application_date: '2026-10-01',
        status: 'Approved',
      },
    ],
    [
      {
        claim_id: 1,
        application_id: 1,
        claim_amount: 500,
        hospital_name: 'Clinic',
        incident_date: '2026-10-05',
        claim_details: 'Test claim',
        claim_date: '2026-10-06',
        status: 'Approved',
      },
    ],
    [
      {
        payment_id: 1,
        application_id: 1,
        user_id: 2,
        amount: 89,
        payment_method: 'Card',
        account_mask: 'Card •••• 4242',
        transaction_ref: 'TXN-1001',
        payment_date: '2026-10-02',
        status: 'Paid',
      },
    ]
  );

  assert.equal(analytics.totalCollectedPremium, 89);
  assert.equal(analytics.totalApprovedClaimPayout, 500);
  assert.equal(analytics.byCategory[0].approvedCount, 1);
});

test('getClaimProgress and validateClaimNoteInput compute stage progress and validate notes', () => {
  assert.equal(getClaimProgress('Pending').percent, 25);
  assert.equal(getClaimProgress('Under Review').percent, 60);
  assert.equal(getClaimProgress('Approved').percent, 100);
  assert.equal(getClaimProgress('Rejected').percent, 100);

  const badNote = validateClaimNoteInput({ title: 'Hi', body: 'ok' });
  assert.equal(badNote.valid, false);
  assert.ok(badNote.errors.title);
  assert.ok(badNote.errors.body);

  const goodNote = validateClaimNoteInput({
    title: 'Hospital Discharge Report',
    body: 'Submitted itemized clinic invoice and physician sign-off.',
  });
  assert.equal(goodNote.valid, true);
});

test('computeClaimsBillSummary calculates total claimed, settled, pending, and rejected bills', () => {
  const bill = computeClaimsBillSummary([
    {
      claim_id: 1,
      application_id: 1,
      claim_amount: 1850,
      hospital_name: 'Pacific Coast Medical Center',
      incident_date: '2026-09-22',
      claim_details: 'MRI and physiotherapy',
      claim_date: '2026-09-25',
      status: 'Approved',
    },
    {
      claim_id: 2,
      application_id: 1,
      claim_amount: 920,
      hospital_name: 'Bayview Diagnostic Clinic',
      incident_date: '2026-11-03',
      claim_details: 'Pediatric diagnostics',
      claim_date: '2026-11-06',
      status: 'Under Review',
    },
    {
      claim_id: 3,
      application_id: 2,
      claim_amount: 400,
      hospital_name: 'Oakridge Clinic',
      incident_date: '2026-10-01',
      claim_details: 'Outpatient screening',
      claim_date: '2026-10-02',
      status: 'Rejected',
    },
  ]);

  assert.equal(bill.totalClaimsCount, 3);
  assert.equal(bill.totalClaimedAmount, 3170);
  assert.equal(bill.approvedSettledAmount, 1850);
  assert.equal(bill.pendingReviewAmount, 920);
  assert.equal(bill.rejectedAmount, 400);
});
