// Runtime-only explicit entrypoint: no models or browser host ports.
import {runPersistentInstalledTrial} from './persistent-installed-trial-core.mjs';
await runPersistentInstalledTrial('runtime-only');
