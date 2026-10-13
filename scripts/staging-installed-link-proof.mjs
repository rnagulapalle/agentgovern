import {runLinkCheck} from './check-links.mjs';
import {withOwnedInstalledStagingFixture} from './staging-owned-installed-fixture.mjs';
// runLinkCheck owns Next and confirms its exit before this callback returns.
// Only then may the fixture retire its SQL roles and owned database container.
await withOwnedInstalledStagingFixture(async fixture=>runLinkCheck({
 PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',
 LOOPLABS_TENANT_WEB_CONFIG:fixture.webFile,
 LOOPLABS_WORKSPACE_ID:'local-proof',LOOPLABS_RECOVERY_EPOCH:fixture.epoch,
 ...(process.env.LINK_CHECK_PORT?{LINK_CHECK_PORT:process.env.LINK_CHECK_PORT}:{}),
}));
