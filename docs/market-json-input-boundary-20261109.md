# Market workbench JSON input boundary (2026-11-09)

## Public, untrusted input

Use `HASMarketData.analyzeJSON(rawText, analysisTimestamp)` for untrusted data. `rawText` and the timestamp must be primitive strings. The workbench now calls this entry point. The UI retains its existing empty-input, UTF-8 size, malformed-JSON, and object-envelope messages; its length precheck avoids allocating an oversized UTF-8 buffer.

Before parsing, the engine bounds the text to 1,000,000 UTF-8 bytes, including whitespace. After parsing it takes an independent data snapshot, bounded to depth 16, 150,000 visited nodes, arrays of at most 150,000 slots, and a conservative 1,000,000-byte serialized-data budget. Keys and string values count toward this budget. Escaped control characters are conservatively counted as six bytes. These are rejection limits, not a promise to accept every syntactically valid document under 1 MB. Failures return an invalid result rather than throwing parse errors to the UI.

JSON text cannot carry getters, Proxy traps, functions, or executable `toJSON` methods. Object snapshots use null prototypes so JSON keys such as `__proto__` are inert own data, not prototype setters. Schema validation still determines whether the supplied data is useful or valid. This does not authenticate market data, confer source rights, or upgrade verification.

## Trusted programmatic compatibility API

`analyzePack(object, analysisTimestamp)` remains for **trusted, same-realm programmatic data objects**. It is not an isolation boundary for hostile JavaScript objects. JavaScript reflection (`getPrototypeOf`, `ownKeys`, and descriptor inspection) can invoke Proxy traps; browsers have no reliable generic Proxy detection primitive. A trap can execute, mutate state, allocate, throw, or never return before this code can reject anything. Do not pass untrusted objects to this API or claim it prevents all caller code execution.

The implementation captures own descriptors before descending, copies their values into private data, and never serializes or directly reads properties from the original input. Ordinary accessors, functions, symbols, non-finite numbers, cycles, exotic prototypes, and unsupported array properties are rejected. Non-enumerable object data and undefined object values are omitted; undefined array elements and holes become null. Sparse array length is bounded before walking slots; long strings are rejected before copying or serialization. Repeated non-cyclic references are independently copied and count toward limits.

The legacy valuation engine still serializes its input. Before that handoff, this module shadows inherited array `toJSON` hooks on its private valuation-document snapshot. Object snapshots already have null prototypes. Neither operation mutates the caller's input. These defenses do not promise safe operation in a fully compromised JavaScript runtime with replaced built-ins or arbitrary prototype getters. The other standalone module entry points retain their own separate contracts.

## Focused offline verification

- `tests/market-json-boundary.test.cjs`: primitive-only text boundary, fixture parity, malformed envelopes, UTF-8/length/depth/node limits, enormous sparse arrays, getters, own and inherited toJSON, nested Proxy mutation of an already-captured root descriptor, prototype-looking keys, undefined compatibility.
- `tests/review-fixes-independent.test.cjs`: preserved ordinary accessor and unsupported-structure tests; corrected the old false generic Proxy-rejection claim. A get-only Proxy is copied without invoking its get trap; reflective traps remain explicitly outside the trust contract.
- `tests/data-workbench-dom.cjs`: stub requires a primitive JSON string through analyzeJSON; existing integration, rendering, byte-limit and storage-sentinel checks remain.

No network test, browser socket launch, deployment, production app/service-worker change, or full npm suite is part of this focused check.
