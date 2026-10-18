// One-shot scoped inspection in application network, no owner credential input.
import assert from 'node:assert/strict';
import {inspectPersistentOfflineSource} from './persistent-installed-source-binding.mjs';
import {inspectPersistentRuntimeContinuation} from './persistent-installed-owner.ts';
const [root,sha,sourceRoot]=process.argv.slice(2);assert.equal(process.env.LOOPLABS_PERSISTENT_CONTINUATION,'explicit-scoped-inspection');assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');
const source=await inspectPersistentOfflineSource(sourceRoot,sha);
const observed=await inspectPersistentRuntimeContinuation(root,sha,sourceRoot);await source.assertStable();console.log(JSON.stringify(observed));
