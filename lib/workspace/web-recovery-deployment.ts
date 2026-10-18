// The sealed installation is the external epoch authority for every workspace.
// An explicitly configured single-workspace deployment fence cannot disagree
// with that generation or be silently ignored during server activation.
export function assertWebRecoveryDeployment(web:readonly {org:string;epoch:string}[],env:Readonly<Record<string,string|undefined>>){
 const org=env.LOOPLABS_WORKSPACE_ID,epoch=env.LOOPLABS_RECOVERY_EPOCH;
 if(org===undefined&&epoch===undefined)return;
 if(!org||!/^[-_a-zA-Z0-9]{1,64}$/.test(org)||!epoch||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(epoch))throw Error('External web recovery fence unavailable');
 const entries=web.filter(e=>e.org===org);
 if(entries.length!==1||entries[0].epoch!==epoch.toLowerCase())throw Error('External web recovery fence differs from sealed generation');
}
