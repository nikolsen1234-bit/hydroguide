# HydroGuide Migration Brief

This example brief is intentionally non-mutating. It exists to verify that the sandbox migration harness can split work into shards, stage files, run checks, and return artifact bundles.

For real migrations, replace this file with a concrete scoped task such as:

- migrate one API helper from one interface to another
- update one package or route family
- modernize one isolated frontend utility

The agent must return a patch for review. It must not apply changes directly to the host checkout.
