// Proof-only user navigation. No DOM/CSS mutation or forced hidden clicks.
import type {Page} from '@playwright/test';
export type ChatPane='conversation'|'plan'|'activity';
export async function currentChatPane(page:Page):Promise<ChatPane|null>{
 const workspace=page.locator('.cp-chat-workspace');const count=await workspace.count();if(count===0)return null;if(count!==1)throw Error('Single chat workspace required');
 const value=await workspace.getAttribute('data-view');if(value!=='conversation'&&value!=='plan'&&value!=='activity')throw Error('Known chat pane required');return value;
}
export async function selectVisibleChatPane(page:Page,pane:ChatPane){
 const nav=page.getByRole('navigation',{name:'Workspace views'});if(!await nav.isVisible())return false;
 const name=pane[0].toUpperCase()+pane.slice(1),button=nav.getByRole('button',{name,exact:true});
 if(!await button.isVisible())throw Error('Visible chat pane button required');await button.click();
 if(await button.getAttribute('aria-pressed')!=='true'||await currentChatPane(page)!==pane)throw Error('Chat pane selection not established');return true;
}
