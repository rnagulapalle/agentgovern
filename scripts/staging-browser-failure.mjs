// Private diagnostic projection. Excludes DOM, bodies, cookies and raw errors.
import assert from 'node:assert/strict';
import {quotePrivateCause} from './typed-quote-browser-proof.mjs';
import {safeBrowserFailure} from './staging-trial-failure.mjs';
export function privateBrowserFailure({phase,error,secrets=[],httpStatus=null}){
 assert(safeBrowserFailure({phase}),'Only existing browser proof phases are retained');
 return {phase,...(Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?{lastChatHttpStatus:httpStatus}:{}),cause:quotePrivateCause(error,secrets)};
}
