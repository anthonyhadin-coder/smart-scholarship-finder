const norm = v => String(v || '').trim().toLowerCase();

function overlap(studentArr, requiredArr, maxPoints) {
  if (!requiredArr?.length) return maxPoints;
  if (!studentArr?.length) return 0;
  const found = requiredArr.filter(r =>
    studentArr.some(s => norm(s) === norm(r) || norm(s).includes(norm(r)) || norm(r).includes(norm(s)))
  );
  return Math.round(new Set(found.map(norm)).size / requiredArr.length * maxPoints);
}

function scoreScholarship(student, s, now = new Date()) {
  const failures = [];
  const unknown = [];
  const reasons = [];

  // 1. GPA Evaluation
  const gpa = Number(student.gpa);
  const scale = Number(student.gpaScale || 10);
  const sScale = Number(s.gpaScale || 10);
  const minGpa = Number(s.minGPA || 0);

  if (student.gpa === undefined || student.gpa === null || !Number.isFinite(gpa)) {
    if (minGpa > 0) {
      unknown.push(`Add your GPA/marks to verify the academic requirement (Minimum ${minGpa}/${sScale}).`);
    }
  } else {
    const normalizedStudentGpa = (gpa / scale) * sScale;
    if (minGpa > 0) {
      if (normalizedStudentGpa < minGpa) {
        failures.push(`Minimum GPA is ${minGpa} on a ${sScale}-point scale (Your score: ${(normalizedStudentGpa).toFixed(1)}).`);
      } else {
        reasons.push(`GPA meets academic requirement (${(normalizedStudentGpa).toFixed(1)} / ${sScale}).`);
      }
    }
  }

  // 2. Degree / Education Level Evaluation
  const sDegreeLevels = s.degreeLevels || [];
  if (sDegreeLevels.length > 0) {
    if (!student.degreeLevel && !student.educationLevel) {
      unknown.push('Select your degree/education level to confirm eligibility.');
    } else {
      const studentDegree = norm(student.degreeLevel || student.educationLevel || '');
      const matchesDegree = sDegreeLevels.some(d => norm(d) === studentDegree);
      if (!matchesDegree) {
        failures.push(`Degree level does not match. Requires: ${sDegreeLevels.join(', ')}.`);
      } else {
        reasons.push(`Education level matches (${sDegreeLevels.join(', ')}).`);
      }
    }
  }

  // 3. Annual Family Income
  if (s.maxIncome && Number(s.maxIncome) > 0) {
    const studentIncome = Number(student.annualFamilyIncome);
    if (student.annualFamilyIncome === undefined || student.annualFamilyIncome === null || !Number.isFinite(studentIncome)) {
      unknown.push(`Annual family income verification required (Must be ≤ ₹${s.maxIncome.toLocaleString('en-IN')}).`);
    } else if (studentIncome > s.maxIncome) {
      failures.push(`Annual family income exceeds maximum limit (Cap: ₹${s.maxIncome.toLocaleString('en-IN')}, Entered: ₹${studentIncome.toLocaleString('en-IN')}).`);
    } else {
      reasons.push(`Family income meets need-based criteria (≤ ₹${s.maxIncome.toLocaleString('en-IN')}).`);
    }
  }

  // 4. Gender Restriction
  if (s.genderRestriction && s.genderRestriction !== 'all') {
    const studentGender = norm(student.gender || '');
    if (!studentGender) {
      unknown.push(`Gender requirement not verified (${s.genderRestriction} applicants only).`);
    } else if (studentGender !== norm(s.genderRestriction)) {
      failures.push(`Open to ${s.genderRestriction} applicants only.`);
    } else {
      reasons.push(`Gender eligibility criteria met (${s.genderRestriction}).`);
    }
  }

  // 5. Category Restrictions (e.g. SC, ST, OBC, EWS)
  if (s.categoryRestriction && s.categoryRestriction.length > 0) {
    const studentCat = norm(student.category || '');
    if (!studentCat) {
      unknown.push(`Social category requirement not verified (Requires: ${s.categoryRestriction.join(', ')}).`);
    } else if (!s.categoryRestriction.some(c => norm(c) === studentCat)) {
      failures.push(`Category requirement not met (Applicable to: ${s.categoryRestriction.join(', ')}).`);
    } else {
      reasons.push(`Category criteria met (${student.category}).`);
    }
  }

  // 6. Location / State / Citizenship
  if (s.citizenship && s.citizenship.length > 0) {
    const studentCit = norm(student.citizenship || student.country || '');
    if (!studentCit) {
      unknown.push(`Add citizenship/residency to verify this requirement (${s.citizenship.join(', ')}).`);
    } else if (!s.citizenship.some(c => norm(c) === studentCit)) {
      failures.push(`Citizenship/residency does not match (Requires: ${s.citizenship.join(', ')}).`);
    } else {
      reasons.push('Citizenship/residency requirement met.');
    }
  }

  if (s.locations && s.locations.length > 0) {
    const studentLoc = norm(student.state || student.location || '');
    if (!studentLoc) {
      unknown.push(`Location verification required (Eligible regions: ${s.locations.join(', ')}).`);
    } else if (!s.locations.some(l => norm(l) === studentLoc || norm(l).includes(studentLoc) || studentLoc.includes(norm(l)))) {
      failures.push(`Location requirement not met (Requires: ${s.locations.join(', ')}).`);
    } else {
      reasons.push(`Location criteria met (${s.locations.join(', ')}).`);
    }
  }

  // 7. Institution Restriction
  if (s.institutionRestriction && s.institutionRestriction.length > 0) {
    const studentInst = norm(student.institution || '');
    if (!studentInst) {
      unknown.push(`Institution check required (Eligible institutions: ${s.institutionRestriction.join(', ')}).`);
    } else if (!s.institutionRestriction.some(i => norm(i) === studentInst || studentInst.includes(norm(i)))) {
      failures.push(`Institution requirement not met (Only for: ${s.institutionRestriction.join(', ')}).`);
    } else {
      reasons.push(`Enrolled at eligible institution.`);
    }
  }

  // Scoring breakdown for relevant fields & interests
  const studentCourses = student.fieldsOfStudy || student.courses || [];
  const fieldOfStudy = overlap(studentCourses, s.fieldsOfStudy || [], 35);
  const tags = overlap(student.tags || [], s.tags || [], 25);

  const days = s.deadline ? Math.ceil((new Date(s.deadline) - now) / 86400000) : null;
  const deadline = !s.deadline ? 10 : days < 0 ? 0 : days <= 7 ? 8 : days <= 60 ? 20 : 15;
  const amount = Number(student.minAmount) > 0 && s.amount < Number(student.minAmount) ? 0 : 20;

  const score = Math.max(0, Math.min(100, fieldOfStudy + tags + deadline + amount));

  if (fieldOfStudy > 0) reasons.push(`Field relevance: ${fieldOfStudy}/35.`);
  if (tags > 0) reasons.push(`Interest tag match: ${tags}/25.`);
  if (days !== null && days < 0) {
    reasons.push('Deadline has passed; verify whether applications are still accepted.');
  }

  // Determine standard 3-tier outcome
  let status = 'eligible';
  let statusLabel = 'Potentially eligible';

  if (failures.length > 0) {
    status = 'ineligible';
    statusLabel = 'Not eligible based on known mandatory criteria';
  } else if (unknown.length > 0) {
    status = 'needs_verification';
    statusLabel = 'More information required';
  }

  return {
    scholarshipId: String(s._id || s.id || ''),
    title: s.title,
    provider: s.provider,
    providerVerified: Boolean(s.providerVerified),
    amount: s.amount,
    currency: s.currency || 'INR',
    deadline: s.deadline || null,
    score,
    status,
    statusLabel,
    breakdown: { fieldOfStudy, tags, deadline, amount },
    reasons,
    unmetCriteria: failures,
    unknownCriteria: unknown,
    note: 'Guidance score and eligibility check only; does not guarantee scholarship selection or award.'
  };
}

module.exports = { scoreScholarship };
