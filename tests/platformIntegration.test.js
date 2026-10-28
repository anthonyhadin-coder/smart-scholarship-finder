const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');
const Scholarship = require('../models/Scholarship');

let server;
let baseUrl;

test.before(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart_scholarship', {
    serverSelectionTimeoutMS: 5000
  });

  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  // Clean up test data
  await User.deleteMany({ email: { $in: ['student.test@example.com', 'provider.a@example.com', 'provider.b@example.com', 'fake.admin@example.com'] } });
  await Scholarship.deleteMany({ title: { $in: ['Provider A Award', 'Provider A Draft Award'] } });
  server.close();
  await mongoose.disconnect();
});

test('Integration: Strict Role Restriction rejects admin registration', async () => {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Admin Hacker',
      email: 'fake.admin@example.com',
      password: 'password123',
      role: 'admin'
    })
  });
  const data = await res.json();
  assert.equal(res.status, 400);
  assert.equal(data.success, false);
  assert.ok(data.message.includes('Invalid role'));
});

test('Integration: Student registration, login, and academic profile workflow', async () => {
  // 1. Register Student
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Priya Sharma',
      email: 'student.test@example.com',
      password: 'password123',
      role: 'student'
    })
  });
  const regData = await regRes.json();
  assert.equal(regRes.status, 201);
  assert.ok(regData.token);
  assert.equal(regData.user.role, 'student');

  const studentToken = regData.token;

  // 2. Update Student Profile
  const profRes = await fetch(`${baseUrl}/api/student/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    },
    body: JSON.stringify({
      educationLevel: 'Undergraduate',
      courses: ['Computer Science', 'Data Science'],
      gpa: 8.8,
      gpaScale: 10,
      annualFamilyIncome: 350000,
      state: 'Karnataka',
      country: 'India',
      gender: 'female',
      category: 'General'
    })
  });
  const profData = await profRes.json();
  assert.equal(profRes.status, 200);
  assert.equal(profData.data.gpa, 8.8);
  assert.equal(profData.data.educationLevel, 'Undergraduate');
});

test('Integration: Provider workflow, Draft/Published states, and strict ownership isolation', async () => {
  // 1. Register Provider A
  const pARes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Future Stars Foundation',
      email: 'provider.a@example.com',
      password: 'password123',
      role: 'provider',
      organization: {
        orgName: 'Future Stars Foundation',
        website: 'https://futurestars.org'
      }
    })
  });
  const pAData = await pARes.json();
  assert.equal(pARes.status, 201);
  assert.equal(pAData.user.role, 'provider');
  assert.equal(pAData.user.isVerified, false); // New provider starts unverified

  const tokenA = pAData.token;

  // 2. Register Provider B
  const pBRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Apex Education Trust',
      email: 'provider.b@example.com',
      password: 'password123',
      role: 'provider'
    })
  });
  const pBData = await pBRes.json();
  const tokenB = pBData.token;

  // 3. Provider A creates a Published scholarship
  const createPubRes = await fetch(`${baseUrl}/api/provider/scholarships`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      title: 'Provider A Award',
      description: 'Undergraduate scholarship for engineering and computing',
      amount: 60000,
      deadline: '2027-04-01',
      degreeLevels: ['Undergraduate'],
      fieldsOfStudy: ['Computer Science'],
      minGPA: 7.5,
      maxIncome: 500000,
      status: 'published'
    })
  });
  const createPubData = await createPubRes.json();
  assert.equal(createPubRes.status, 201);
  const scholarshipId = createPubData.data._id;

  // 4. Provider A creates a Draft scholarship
  const createDraftRes = await fetch(`${baseUrl}/api/provider/scholarships`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    },
    body: JSON.stringify({
      title: 'Provider A Draft Award',
      description: 'Draft not yet visible to public',
      amount: 40000,
      status: 'draft'
    })
  });
  assert.equal(createDraftRes.status, 201);

  // 5. OWNERSHIP ISOLATION: Provider B attempts to edit Provider A's scholarship -> MUST BE 403 FORBIDDEN
  const hackRes = await fetch(`${baseUrl}/api/provider/scholarships/${scholarshipId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    },
    body: JSON.stringify({
      title: 'Hijacked by Provider B'
    })
  });
  assert.equal(hackRes.status, 403);
  const hackData = await hackRes.json();
  assert.ok(hackData.message.includes('Permission denied'));

  // 6. Public discovery ONLY contains published listings (Draft is excluded)
  const publicRes = await fetch(`${baseUrl}/api/scholarships?search=Provider+A`);
  const publicData = await publicRes.json();
  assert.equal(publicRes.status, 200);
  const titles = publicData.data.map(s => s.title);
  assert.ok(titles.includes('Provider A Award'));
  assert.ok(!titles.includes('Provider A Draft Award')); // Draft is hidden from public!
});


test('Integration: /api/health actively reports database connectivity and records count', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.api, 'running');
  assert.equal(data.database.connected, true);
  assert.equal(data.database.name, 'smart_scholarship');
  assert.equal(typeof data.database.publishedRecordsCount, 'number');
});

test('Integration: /health lightweight endpoint returns ok status', async () => {
  const res = await fetch(`${baseUrl}/health`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.database, 'connected');
});

test('Integration: Distinguishes empty scholarship results from connection error', async () => {
  const res = await fetch(`${baseUrl}/api/scholarships?search=NonExistentScholarshipQuery12345`);
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(Array.isArray(data.data), true);
  assert.equal(data.data.length, 0);
  assert.equal(data.isEmpty, true); // Distinct empty flag, not an error!
});
