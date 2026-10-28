const norm=v=>String(v||'').trim().toLowerCase();
function overlap(student,required,max){
 if(!required?.length)return max;if(!student?.length)return 0;
 const found=required.filter(r=>student.some(s=>norm(s)===norm(r)||norm(s).includes(norm(r))||norm(r).includes(norm(s))));
 return Math.round(new Set(found.map(norm)).size/required.length*max);
}
function scoreScholarship(student,s,now=new Date()){
 const failures=[],unknown=[],reasons=[];
 const gpa=Number(student.gpa),scale=Number(student.gpaScale||10),sScale=Number(s.gpaScale||10);
 if(!Number.isFinite(gpa))unknown.push('Add your GPA to verify the academic requirement.');
 else if(gpa/scale*sScale<(s.minGPA||0))failures.push(`Minimum GPA is ${s.minGPA} on a ${sScale}-point scale.`);
 else reasons.push('Your GPA meets the listed minimum.');
 if(!student.degreeLevel)unknown.push('Select your degree level.');
 else if(s.degreeLevels?.length&&!s.degreeLevels.some(v=>norm(v)===norm(student.degreeLevel)))failures.push('Your degree level does not match.');
 else reasons.push('Degree level matches.');
 if(s.citizenship?.length){
  if(!student.citizenship)unknown.push('Add citizenship/residency to verify this requirement.');
  else if(!s.citizenship.some(v=>norm(v)===norm(student.citizenship)))failures.push('Citizenship/residency does not match.');
  else reasons.push('Citizenship/residency matches.');
 }
 const fieldOfStudy=overlap(student.fieldsOfStudy||[],s.fieldsOfStudy||[],35);
 const tags=overlap(student.tags||[],s.tags||[],25);
 const days=s.deadline?Math.ceil((new Date(s.deadline)-now)/86400000):null;
 const deadline=!s.deadline?10:days<0?0:days<=7?8:days<=60?20:15;
 const amount=Number(student.minAmount)>0&&s.amount<Number(student.minAmount)?0:20;
 const score=Math.max(0,Math.min(100,fieldOfStudy+tags+deadline+amount));
 reasons.push(`Field relevance ${fieldOfStudy}/35; interest tags ${tags}/25.`);
 if(days!==null&&days<0)reasons.push('Deadline has passed; verify whether applications are still accepted.');
 const status=failures.length?'ineligible':unknown.length?'needs_verification':'eligible';
 return {scholarshipId:String(s._id||s.id||''),title:s.title,provider:s.provider,amount:s.amount,currency:s.currency||'INR',deadline:s.deadline||null,score,status,breakdown:{fieldOfStudy,tags,deadline,amount},reasons,unmetCriteria:failures,unknownCriteria:unknown,note:'Guidance score only; not an award probability or guarantee.'};
}
module.exports={scoreScholarship};