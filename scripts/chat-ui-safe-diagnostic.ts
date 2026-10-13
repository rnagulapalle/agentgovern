// Fixed public UI counts only. No DOM text, payload, URL query, headers or errors.
import type {Page} from '@playwright/test';
export async function safeChatObservables(page:Page){
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([(async()=>({
  closed:page.isClosed(),
  handoffHeadingCount:await page.getByRole('heading',{name:/Customer handoff/}).count(),
  firstStepCount:await page.locator('article').filter({has:page.getByRole('heading',{name:/^1\. Set/})}).count(),
  secondStepCount:await page.locator('article').filter({has:page.getByRole('heading',{name:/^2\. Send/})}).count(),
  submitCount:await page.getByRole('button',{name:'Submit prepared action',exact:true}).count(),
  approveCount:await page.getByRole('button',{name:'Approve exact action',exact:true}).count(),
  executeCount:await page.getByRole('button',{name:'Execute',exact:true}).count(),
  activityTabCount:await page.getByRole('button',{name:'Activity',exact:true}).count(),
  runProgressCount:await page.getByRole('region',{name:'Run progress'}).count()
 }))(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),2000);})]);}catch{return null;}finally{clearTimeout(timer);}
}
