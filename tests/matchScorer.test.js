const test=require('node:test');const assert=require('node:assert/strict');const {scoreScholarship}=require('../utils/matchScorer');
const s={_id:'x',title:'STEM Award',provider:'Demo',amount:30000,currency:'INR',deadline:'2027-02-01',degreeLevels:['Undergraduate'],fieldsOfStudy:['Computer Science'],minGPA:7,gpaScale:10,tags:['stem']};
const p={gpa:8.2,gpaScale:10,degreeLevel:'Undergraduate',fieldsOfStudy:['Computer Science'],tags:['stem']};
test('matching profile gets bounded score and reasons',()=>{const r=scoreScholarship(p,s,new Date('2026-10-01'));assert.equal(r.status,'eligible');assert.ok(r.score>=0&&r.score<=100);assert.ok(r.reasons.length);});
test('mandatory GPA failure disqualifies',()=>assert.equal(scoreScholarship({...p,gpa:4},s,new Date('2026-10-01')).status,'ineligible'));
test('missing GPA needs verification',()=>{const q={...p};delete q.gpa;assert.equal(scoreScholarship(q,s,new Date('2026-10-01')).status,'needs_verification');});
test('expired deadline receives zero points',()=>assert.equal(scoreScholarship(p,{...s,deadline:'2026-01-01'},new Date('2026-10-01')).breakdown.deadline,0));