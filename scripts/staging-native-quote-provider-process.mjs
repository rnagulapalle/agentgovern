// Exact owned container lifecycle; no test-environment opt-in substitutes for it.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startInstalledNativeQuoteFixture} from './staging-native-quote-provider.ts';
assert(existsSync('/.dockerenv')&&[3,4].includes(process.argv.length));
let listener,closing=false;
const close=async()=>{if(closing)return;closing=true;try{await listener?.close();}catch{process.exitCode=1;}};
process.once('SIGTERM',close);process.once('SIGINT',close);
try{listener=await startInstalledNativeQuoteFixture(process.argv[2],process.argv[3]);if(closing)await listener.close();}
catch{await close();console.error('Owned native quote provider stopped; inspect sanitized health and saved state.');process.exitCode=1;}
