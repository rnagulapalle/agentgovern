/** Presentation-only examples. Never use this evaluator as execution authority. */
export const models = [
  { id: 'gpt-5.2-codex', name: 'GPT-5.2-Codex', provider: 'OpenAI', source: 'https://developers.openai.com/api/docs/models/gpt-5.2-codex' },
  { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'Anthropic', source: 'https://www.anthropic.com/news/claude-sonnet-4-5' },
] as const;
export const skills = [
  { id: 'review', name: 'Code review', version: '2.1', scope: 'Read repository and propose review comments', boundary: 'No merge, release or production credentials' },
  { id: 'test', name: 'Test & repair', version: '1.4', scope: 'Edit a feature branch and run tests in a sandbox', boundary: 'No writes to protected branches' },
  { id: 'release', name: 'Release preparation', version: '1.0', scope: 'Prepare a release plan and validation checklist', boundary: 'Production changes require separate human approval' },
] as const;
export const prompts = [
  { id: 'review-v3', name: 'Review a pull request', version: '3', skill: 'review', text: 'Review the selected pull request for correctness, security and missing tests. Cite file and line evidence. Propose changes; do not merge or deploy.', inputs: 'Repository, pull request and acceptance criteria' },
  { id: 'repair-v2', name: 'Fix a failing test', version: '2', skill: 'test', text: 'Reproduce the specified failing test in the sandbox. Make the smallest fix on a feature branch. Run the relevant checks and report the exact result. Never weaken a test to make it pass.', inputs: 'Repository, feature branch and failing test' },
  { id: 'release-v1', name: 'Prepare a release', version: '1', skill: 'release', text: 'Inspect the approved diff and validation evidence. Prepare a release checklist with risks and rollback steps. Stop before any production mutation.', inputs: 'Approved revision and validation evidence' },
] as const;
export type DemoPolicy = { tokenLimit: number; dollarLimit: number; modelIds: string[]; skillIds: string[]; promptIds: string[] };
export const organization = { id: 'acme', name: 'Acme Corporation', department: 'Engineering', owner: 'Jordan Ellis', domain: 'acme.example.test' };
export const teams = [
 {name:'Platform Engineering',lead:'Maya Chen',scope:'Shared services, developer tooling and infrastructure',repositories:['acme/platform-api','acme/developer-tools']},
 {name:'Product Engineering',lead:'Alex Morgan',scope:'Customer portal, checkout and application services',repositories:['acme/customer-portal','acme/checkout']},
 {name:'Quality Engineering',lead:'Priya Shah',scope:'Test automation, regression analysis and release evidence',repositories:['acme/test-automation','acme/release-checks']},
] as const;
export type Engineer = { id: string; name: string; orgId: string; role: string; email: string; team: string; client: string; model: string; tokens: number; spent: number; policy: DemoPolicy };
export const engineers: Engineer[] = [
  { id:'maya', name:'Maya Chen', orgId:'acme',role:'Staff engineer · team lead',email:'maya.chen@acme.example.test', team:'Platform Engineering', client:'Codex', model:models[0].id, tokens:360000, spent:18.40, policy:{tokenLimit:1000000,dollarLimit:75,modelIds:[models[0].id],skillIds:['review','test','release'],promptIds:['review-v3','repair-v2','release-v1']} },
  { id:'alex', name:'Alex Morgan', orgId:'acme',role:'Engineering manager · team lead',email:'alex.morgan@acme.example.test', team:'Product Engineering', client:'Claude Code', model:models[1].id, tokens:240000, spent:12.10, policy:{tokenLimit:750000,dollarLimit:50,modelIds:[models[1].id],skillIds:['review','test'],promptIds:['review-v3','repair-v2']} },
  { id:'sam', name:'Sam Rivera', orgId:'acme',role:'Senior software engineer',email:'sam.rivera@acme.example.test', team:'Platform Engineering', client:'Cursor', model:models[1].id, tokens:110000, spent:6.50, policy:{tokenLimit:500000,dollarLimit:25,modelIds:models.map(m=>m.id),skillIds:['review'],promptIds:['review-v3']} },
  { id:'nina', name:'Nina Patel', orgId:'acme',role:'Software engineer',email:'nina.patel@acme.example.test',team:'Product Engineering',client:'Codex',model:models[0].id,tokens:180000,spent:9.20,policy:{tokenLimit:750000,dollarLimit:50,modelIds:[models[0].id],skillIds:['review','test'],promptIds:['review-v3','repair-v2']} },
  { id:'priya',name:'Priya Shah',orgId:'acme',role:'Quality engineering lead',email:'priya.shah@acme.example.test',team:'Quality Engineering',client:'Claude Code',model:models[1].id,tokens:150000,spent:7.80,policy:{tokenLimit:500000,dollarLimit:40,modelIds:models.map(m=>m.id),skillIds:['review','test','release'],promptIds:['review-v3','repair-v2','release-v1']} },
  { id:'leo',name:'Leo Brooks',orgId:'acme',role:'Test automation engineer',email:'leo.brooks@acme.example.test',team:'Quality Engineering',client:'Cursor',model:models[1].id,tokens:95000,spent:4.60,policy:{tokenLimit:400000,dollarLimit:30,modelIds:[models[1].id],skillIds:['review','test'],promptIds:['review-v3','repair-v2']} },

];
export type DemoRequest = { model: string; skill: string; prompt: string; tokens: number; estimatedDollars: number; environment: string; dataClass: string };
export type Decision = { outcome: 'allowed'|'review'|'blocked'; reason: string; checks: {name:string;passed:boolean}[] };
export function validPolicy(p: DemoPolicy): boolean {
  return Number.isSafeInteger(p.tokenLimit) && p.tokenLimit>0 && p.tokenLimit<=10000000 && Number.isFinite(p.dollarLimit) && p.dollarLimit>0 && p.dollarLimit<=10000 &&
    Array.isArray(p.modelIds)&&p.modelIds.length>0&&p.modelIds.every(id=>models.some(m=>m.id===id))&&
    Array.isArray(p.skillIds)&&p.skillIds.length>0&&p.skillIds.every(id=>skills.some(s=>s.id===id))&&
    Array.isArray(p.promptIds)&&p.promptIds.length>0&&p.promptIds.every(id=>prompts.some(t=>t.id===id&&p.skillIds.includes(t.skill)));
}
export function evaluateDemo(e:Engineer,r:DemoRequest):Decision {
  const checks:Decision['checks']=[];
  const check=(name:string,passed:boolean)=>{checks.push({name,passed});return passed};
  const blocked=(reason:string):Decision=>({outcome:'blocked',reason,checks});
  if(!check('Valid identity and limits',!!e.id&&validPolicy(e.policy)&&Number.isSafeInteger(e.tokens)&&e.tokens>=0&&Number.isFinite(e.spent)&&e.spent>=0))return blocked('Identity or control configuration is missing or invalid.');
  if(!check('Valid request',Number.isSafeInteger(r.tokens)&&r.tokens>0&&Number.isFinite(r.estimatedDollars)&&r.estimatedDollars>=0&&['sandbox','production'].includes(r.environment)&&['source-code','secret'].includes(r.dataClass)))return blocked('Request fields are missing or invalid.');
  if(!check('Model entitlement',e.policy.modelIds.includes(r.model)))return blocked('This model is outside the engineer’s model allowance.');
  if(!check('Approved skill',e.policy.skillIds.includes(r.skill)))return blocked('This skill is outside the engineer’s approved scope.');
  if(!check('Approved prompt version',e.policy.promptIds.includes(r.prompt)&&prompts.some(p=>p.id===r.prompt&&p.skill===r.skill)))return blocked('The prompt version is not approved for this skill.');
  if(!check('Sensitive data policy',r.dataClass!=='secret'))return blocked('Secret-containing input must not be sent to the model.');
  if(!check('Token allowance',e.tokens+r.tokens<=e.policy.tokenLimit))return blocked('The request exceeds the remaining token allowance.');
  if(!check('Spend allowance',e.spent+r.estimatedDollars<=e.policy.dollarLimit))return blocked('The request exceeds the remaining spend allowance.');
  check('Sandbox execution',r.environment==='sandbox');
  return r.environment==='production'?{outcome:'review',reason:'Production access requires a separate authorized human decision. Nothing was executed.',checks}:{outcome:'allowed',reason:'This example fits the selected model, skill, prompt and budget controls. Nothing was sent to a model.',checks};
}
export const scenarios:{id:string;name:string;request:DemoRequest}[]=[
  {id:'review',name:'Review a pull request',request:{model:models[0].id,skill:'review',prompt:'review-v3',tokens:12000,estimatedDollars:0.60,environment:'sandbox',dataClass:'source-code'}},
  {id:'budget',name:'Exceed token allowance',request:{model:models[0].id,skill:'review',prompt:'review-v3',tokens:11000000,estimatedDollars:2,environment:'sandbox',dataClass:'source-code'}},
  {id:'secret',name:'Input contains a secret',request:{model:models[0].id,skill:'review',prompt:'review-v3',tokens:12000,estimatedDollars:0.60,environment:'sandbox',dataClass:'secret'}},
  {id:'production',name:'Request production access',request:{model:models[0].id,skill:'release',prompt:'release-v1',tokens:12000,estimatedDollars:0.60,environment:'production',dataClass:'source-code'}},
];
