// Render only the actual saved request; never replace it with the current template.
export function savedMessage(value:unknown):{recipient:string;subject:string;text:string}|null{
 const b=value as {to?:unknown;subject?:unknown;text?:unknown};
 if(!b || typeof b!=="object" || !Array.isArray(b.to) || b.to.length!==1 || typeof b.to[0]!=="string" || !b.to[0] || typeof b.subject!=="string" || !b.subject || typeof b.text!=="string" || !b.text)return null;
 return {recipient:b.to[0],subject:b.subject,text:b.text};
}
