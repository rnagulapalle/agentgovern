import {sourceFailureCategory} from './temporal-proof-source';
export function sanitizedProofFailure(error:unknown,phase:string){
 const value=error&&typeof error==='object'?error as {code?:unknown;status?:unknown}:{};
 const code=typeof value.code==='string'&&(/^[0-5][0-9A-Z]{4}$/.test(value.code)||value.code==='ERR_ASSERTION')?value.code:null;
 const status=typeof value.status==='number'&&[400,401,403,404,409,503].includes(value.status)?value.status:null;
 return{phase,category:sourceFailureCategory(error),code,status};
}
