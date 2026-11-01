import type {CompanyProfile} from "@/lib/workspace/company-profile-contract";
/** Directory context only. Executions remain owned by their existing deployment. */
export function ReferenceCompanyDirectory({profile}:{profile:CompanyProfile|null}){
 const r=profile?.reference;if(!profile||!r)return null;
 const person=(id:string)=>r.employees.find(p=>p.id===id)?.name??"Owner unavailable";
 const team=(id:string)=>profile.teams.find(t=>t.id===id)?.name??"Team unavailable";
 return <section className="cc-section cp-panel" aria-label="FetchSandbox company directory"><h2>FetchSandbox business directory</h2>
 <p>LoopLabs is the control-plane partner. This synthetic company uses simulated tools. Directory entries describe the business; they do not create accounts, deploy infrastructure or enable workflow execution.</p>
 <p>{r.employees.length} employees · {profile.departments.length} departments · {profile.teams.length} teams · {r.tools.length} tool definitions · {r.workflows.length} workflow definitions</p>
 <details><summary>Employees and reporting lines</summary>{r.employees.map(p=><article key={p.id} className="cc-member"><strong>{p.name}</strong><span>{p.title} · {team(p.teamId)} · {p.status}</span><span>{p.email}</span><span>Manager: {p.managerId?person(p.managerId):"Company lead"}</span></article>)}</details>
 <details><summary>Tool stack · simulated and unbound</summary>{r.tools.map(t=><article key={t.id} className="cc-member"><strong>{t.name}</strong><span>{t.purpose}</span><span>Owner: {person(t.ownerId)} · No execution binding</span></article>)}</details>
 <details><summary>Infrastructure definitions · sandbox</summary>{r.infrastructure.map(i=><article key={i.id} className="cc-member"><strong>{i.name}</strong><span>{i.kind} · {i.environment} · {person(i.ownerId)}</span></article>)}</details>
 <details><summary>Business workflow definitions · execution not connected</summary>{r.workflows.map(w=><article key={w.id} className="cc-member"><strong>{w.name}</strong><span>{w.purpose}</span><span>{team(w.teamId)} · Owner: {person(w.ownerId)} · Reviewers: {w.reviewerIds.map(person).join(", ")}</span><span>Tools: {w.toolIds.map(id=>r.tools.find(t=>t.id===id)?.name??"Unavailable").join(", ")}</span><span>Steps: {w.actions.join(" → ")}</span><span>Declared business context; no run history or execution authority is implied.</span></article>)}</details>
 </section>;
}
