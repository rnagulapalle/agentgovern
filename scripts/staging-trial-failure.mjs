// Only predefined checkpoint names and a numeric HTTP status may leave the trial.
const phases=new Set(["inputs","sessions","unauthenticated-refusal","record-catalog","record-enrollment","agent-grants","saved-plan","submission","held-run","self-approval-refusal","pre-approval-containment","restart-checkpoint","session-recovery","independent-approval","completion","temporal-dispatch","temporal-history","lost-response-proof","history-replay","provider-readback"]);
export function safeTrialFailure(report){
 if(!report || !phases.has(report.phase))return "";
 const status=Number.isInteger(report.httpStatus)&&report.httpStatus>=100&&report.httpStatus<=599?` HTTP ${report.httpStatus}`:"";
 const kind=new Set(["catalog","provider","binding","source","service"]).has(report.errorKind)?` ${report.errorKind}`:"";
 return ` (${report.phase}${status}${kind})`;
}
