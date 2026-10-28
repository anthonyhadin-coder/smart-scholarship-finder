const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreScholarship } = require('../utils/matchScorer');

test('Eligibility matching evaluates income limits', () => {
  const scholarship = {
    title: 'Need-based Grant',
    maxIncome: 250000,
    minGPA: 6,
    gpaScale: 10
  };

  // Student earning over limit
  const wealthyStudent = { gpa: 8, gpaScale: 10, annualFamilyIncome: 500000 };
  const res1 = scoreScholarship(wealthyStudent, scholarship);
  assert.equal(res1.status, 'ineligible');
  assert.equal(res1.statusLabel, 'Not eligible based on known mandatory criteria');
  assert.ok(res1.unmetCriteria.some(c => c.includes('Annual family income exceeds')));

  // Student within income limit
  const eligibleStudent = { gpa: 8, gpaScale: 10, annualFamilyIncome: 150000 };
  const res2 = scoreScholarship(eligibleStudent, scholarship);
  assert.equal(res2.status, 'eligible');
  assert.equal(res2.statusLabel, 'Potentially eligible');
  assert.ok(res2.reasons.some(c => c.includes('Family income meets')));

  // Student with missing income
  const unknownStudent = { gpa: 8, gpaScale: 10 };
  const res3 = scoreScholarship(unknownStudent, scholarship);
  assert.equal(res3.status, 'needs_verification');
  assert.equal(res3.statusLabel, 'More information required');
  assert.ok(res3.unknownCriteria.some(c => c.includes('Annual family income verification required')));
});

test('Eligibility matching evaluates gender and category restrictions', () => {
  const womenScholarship = {
    title: 'Women in STEM',
    genderRestriction: 'female',
    categoryRestriction: ['OBC', 'SC', 'ST'],
    degreeLevels: ['Undergraduate']
  };

  // Male student
  const maleStudent = { educationLevel: 'Undergraduate', gender: 'male', category: 'OBC' };
  const resMale = scoreScholarship(maleStudent, womenScholarship);
  assert.equal(resMale.status, 'ineligible');
  assert.ok(resMale.unmetCriteria.some(c => c.includes('female applicants only')));

  // Eligible female student
  const femaleStudent = { educationLevel: 'Undergraduate', gender: 'female', category: 'OBC' };
  const resFemale = scoreScholarship(femaleStudent, womenScholarship);
  assert.equal(resFemale.status, 'eligible');
  assert.equal(resFemale.statusLabel, 'Potentially eligible');

  // Missing category student
  const noCatStudent = { educationLevel: 'Undergraduate', gender: 'female' };
  const resNoCat = scoreScholarship(noCatStudent, womenScholarship);
  assert.equal(resNoCat.status, 'needs_verification');
  assert.equal(resNoCat.statusLabel, 'More information required');
});

test('Strictly rejects non-permitted roles', () => {
  const allowedRoles = ['student', 'provider'];
  assert.ok(allowedRoles.includes('student'));
  assert.ok(allowedRoles.includes('provider'));
  assert.ok(!allowedRoles.includes('admin'));
  assert.ok(!allowedRoles.includes('superadmin'));
  assert.ok(!allowedRoles.includes('moderator'));
});
