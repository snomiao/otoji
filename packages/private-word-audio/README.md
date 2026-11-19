# Private word audio

Pure validation and bounded ZIP-member collection for account-private recording bindings.
The host supplies authentication, private file fetching, ZIP decompression, hashing, storage,
and playback ownership. No account ids, file ids or recordings are bundled in this package.

Manifest version 1 carries original chapters and conservatively accepted word ranges.
`estimated: true` and `verified: false` are intentional: hosts must label machine alignment
honestly. Entries omitted by the aligner use the host's normal speech fallback.

Use `parseNativeManifest`, `nativeWordIndex`, `validateArchiveMembers` and
`collectNativeMember`. Parsing rejects duplicate card identities/terms, unsafe paths,
invalid hashes, oversized sources and intervals outside their original media timeline.
The host must still verify ownership and hashes and cancel playback on account changes.

Run tests with `bun test test` in this directory.
