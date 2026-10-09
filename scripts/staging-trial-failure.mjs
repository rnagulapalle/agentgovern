// Only predefined checkpoint names and a numeric HTTP status may leave the trial.
const phases=new Set(["inputs","sessions","unauthenticated-refusal","record-catalog","record-enrollment","agent-grants","saved-plan","submission","held-run","self-approval-refusal","pre-approval-containment","restart-checkpoint","session-recovery","independent-approval","completion","temporal-dispatch","temporal-history","lost-response-proof","history-replay","provider-readback"]);
export function safeTrialFailure(report){
 if(!report || !phases.has(report.phase))return "";
 const status=Number.isInteger(report.httpStatus)&&report.httpStatus>=100&&report.httpStatus<=599?` HTTP ${report.httpStatus}`:"";
 const kind=new Set(["catalog","provider","binding","source","service"]).has(report.errorKind)?` ${report.errorKind}`:"";
 return ` (${report.phase}${status}${kind})`;
}
export function safeBrowserFailure(report){
 const allowed=new Set(["certificate-refusal","certificate-trust","named-sign-in","prepared-plan","typed-request","typed-clarification","record-opening","agent-selection","review-submit","self-approval","hostile-origin","independent-review","verified-completion","mobile-reload","http-refusal"]);
 return report&&allowed.has(report.phase)?` (browser ${report.phase})`:"";
}

// Extract bounded process facts; never return raw container logs or error text.
export function safeProviderFailure(state,logs=""){
 if(!state || typeof state!=="object")return "";
 const status=new Set(["running","restarting","exited","dead","created"]).has(state.Status)?state.Status:"unknown";
 const exit=Number.isInteger(state.ExitCode)&&state.ExitCode>=0&&state.ExitCode<=255?state.ExitCode:"unknown";
 const errors=["ModuleNotFoundError","ImportError","PermissionError","FileNotFoundError","ValueError","OSError"];
 const kind=typeof logs==="string"?errors.find(e=>new RegExp(`(?:^|\\n)${e}:`).test(logs)):undefined;
 return ` provider ${status} exit ${exit}${state.OOMKilled===true?" oom":""}${kind?` ${kind}`:""}`;
}
