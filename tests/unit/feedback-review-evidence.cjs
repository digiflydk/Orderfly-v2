const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

const workflow=readFileSync(require('node:path').join(__dirname,'../../.github/workflows/feedback-code-review.yml'),'utf8');
const block=workflow.split('      - name: Verify independent GitHub reviewer verdict')[1].split('      - name: Remove transient context')[0];
const script=block.split('          script: |\n')[1].split('\n').map(line=>line.slice(12)).join('\n');
const head='a'.repeat(40),base='b'.repeat(40),reviewer='chatgpt-codex-connector[bot]';

async function verify(patch={}) {
 const writes=[];
 const pr={number:371,state:'open',head:{sha:head},base:{sha:base}};
 const request={id:1,html_url:'https://github.com/example/repo/pull/371#issuecomment-1',author_association:'OWNER',created_at:'2026-10-01T13:01:00Z',body:'@codex review\nReviewed-Head: '+head+'\nReview-Base: '+base,...patch.request};
 let reads=0;
 const api={get:async()=>({data:{...pr,...patch.pr,...(patch.lateHead&&++reads>1?{head:{sha:base}}:{})}}),comments:async()=>[request],reactions:async()=>patch.reactions??[{user:{login:reviewer},content:'+1'}],reviews:async()=>patch.reviews??[],inline:async()=>patch.inline??[],write:async args=>writes.push(args)};
 const github={rest:{pulls:{get:api.get,listReviews:api.reviews,listReviewComments:api.inline},issues:{listComments:api.comments,createComment:api.write},reactions:{listForIssueComment:api.reactions}},paginate:(method,args)=>method(args)};
 const env={EXPECTED_HEAD:head,EXPECTED_BASE:base,ENGINEERING_GREEN_AT:String(Date.parse('2026-10-01T13:00:00Z'))};
 const context=vm.createContext({github,context:{repo:{owner:'example',repo:'repo'},issue:{number:371},runId:123},process:{env},Date,Number,String,Error,Promise,setTimeout:fn=>fn()});
 const outcome=vm.runInContext('(async()=>{'+script+'})()',context);
 return {outcome,writes};
}

test('independent reviewer clean signal attests only the exact unchanged green candidate',async()=>{
 const f=await verify();await f.outcome;assert.equal(f.writes.length,1);
 assert.match(f.writes[0].body,/^WORK_CODE_REVIEW: CLEAN\nReviewed-Head: a{40}\n/);
 assert.match(f.writes[0].body,/Independent-Reviewer: chatgpt-codex-connector\[bot\]/);
 assert.match(f.writes[0].body,/Independent-Review-Request: https:\/\/github.com\/example\/repo\/pull\/371#issuecomment-1/);
});
test('stale, untrusted and absent reviewer evidence cannot emit a clean verdict',async()=>{
 for(const patch of [
  {request:{author_association:'NONE'}},
  {request:{created_at:'2026-10-01T12:59:00Z'}},
  {request:{body:'@codex review\nReviewed-Head: '+base+'\nReview-Base: '+base}},
  {reactions:[{user:{login:'another-bot'},content:'+1'}]},
  {reactions:[{user:{login:reviewer},content:'eyes'}]},
  {pr:{head:{sha:base}}},
  {lateHead:true},
  {inline:[{user:{login:reviewer},commit_id:head}]},
  {inline:[{user:{login:reviewer},commit_id:base,original_commit_id:head}]},
  {reviews:[{user:{login:reviewer},commit_id:head,state:'CHANGES_REQUESTED'}]},
 ]) {const f=await verify(patch);await assert.rejects(f.outcome);assert.equal(f.writes.length,0);}
});

test('GitHub moving a corrected old comment forward does not invent a new-head finding',async()=>{
 const f=await verify({inline:[{user:{login:reviewer},commit_id:head,original_commit_id:base}]});
 await f.outcome;assert.equal(f.writes.length,1);
});
