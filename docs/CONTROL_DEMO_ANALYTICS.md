# Control demo analytics build inputs

The existing control-demo release requires an explicitly supplied PostHog public project key (`NEXT_PUBLIC_POSTHOG_KEY`). It is browser-visible configuration, not a server API key. The only supported host is the existing same-origin `/ph` proxy. Supply the approved LoopLabs project key in the release process environment before running `./deploy.sh --profile control-demo`. No configuration is read automatically from dotenv files or copied from runtime credentials.

The entry validates these inputs before CI or SSH, forwards only the two public fields through the otherwise cleared remote build environment, and validates them again before the owned image build. Missing or malformed input refuses the release. Do not enable shell tracing. The build receipt stores a configuration digest rather than the key.

This changes only the existing control-demo web build. It adds no SDK, telemetry service, workflow execution or new collection host. Existing profile, authorization, source, rollback and release gates still apply. The default/quote release paths are unchanged.

Source tests and command recorders do not establish a deployed image or event ingestion. After the gated release, separately record the actual image/source and compiled initialization, native labeled QA delivery with `$is_test`, and its exclusion from buyer funnels. Keep historic founder coverage and qualified bookings unknown until independently observed. Issue #156 tracks these checks. A private-host access hold does not prevent local source implementation.
