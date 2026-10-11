// Bounded failure metadata only. Never include exception messages, details or stacks.
const phases=new Set(['inputs','private-input','owner-database','temporal-connect','intent-claim','reset-rpc','response-check','dispatch-readback','retry-claim','execution-wait','lineage-readback','observed-claim','marker']);
export function resetOwnerDiagnostic(phase,error){
 const code=typeof error?.code==='number'&&Number.isInteger(error.code)&&error.code>=0&&error.code<=16?`grpc-${error.code}`:typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code)?`sql-${error.code}`:error?.code==='ERR_ASSERTION'?'assertion':'unclassified';
 return `Reset owner refusal phase=${phases.has(phase)?phase:'inputs'} code=${code}`;
}
export function resetOwnerDiagnosticLine(stderr){
 if(typeof stderr!=='string')return null;
 const lines=stderr.split('\n');
 for(const line of lines){
  const m=/^Reset owner refusal phase=([a-z-]+) code=(grpc-(?:[0-9]|1[0-6])|sql-[0-9A-Z]{5}|assertion|unclassified)$/.exec(line);
  if(m&&phases.has(m[1]))return line;
 }
 return null;
}
