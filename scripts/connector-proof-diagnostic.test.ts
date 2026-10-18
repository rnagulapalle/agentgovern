import { expect,test } from 'vitest';
import { AssertionError } from 'node:assert';
import { ControlError } from '../lib/durable/contracts';
import { connectorFailureDiagnostic } from './connector-proof-diagnostic';
test('failure projection refuses raw assertion values, credentials, stack paths and malformed HTTP metadata',()=>{
 const secret='synthetic-password-material';const error=new AssertionError({message:secret,actual:{token:secret},expected:{payload:secret}});error.stack=`Error: ${secret}\n at /private/${secret}/connector-proof.ts:755:3`;
 const result=connectorFailureDiagnostic(error,27,{route:'enquiries',operation:'prepare',status:503});
 expect(result).toMatchObject({checkIndex:27,type:'assertion',assertionLine:755,lastHttp:{route:'enquiries',operation:'prepare',status:503},successfulReceipt:false});expect(JSON.stringify(result)).not.toContain(secret);
 expect(connectorFailureDiagnostic(error,-1,{route:secret,operation:'prepare',status:200} as never)).toMatchObject({checkIndex:null,lastHttp:null});
});
test('known SQL code and locally authentic ControlError status are bounded, arbitrary properties are never classified authority',()=>{
 const sql=Object.assign(Error('do not emit database credentials'),{code:'42501',status:403});expect(connectorFailureDiagnostic(sql,1)).toMatchObject({type:'error',sqlCode:'42501',controlStatus:null});
 expect(connectorFailureDiagnostic(new ControlError(403,'private operator'),1)).toMatchObject({type:'control',sqlCode:null,controlStatus:403});
 expect(connectorFailureDiagnostic(Object.assign(Error('secret'),{code:'untrusted',status:200}),1)).toMatchObject({type:'error',sqlCode:null,controlStatus:null});
 expect(connectorFailureDiagnostic({message:'secret',stack:'secret'},1)).toMatchObject({type:'unknown',sqlCode:null,assertionLine:null});
});
