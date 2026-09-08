# Production browser measurements

Generated 2026-09-08T01:10:13.159Z. React 19.2.8, Chrome 155.0.8045.0, darwin/arm64, Apple M3 Max.
Hook source: `dcd3748a4c0827824bd59e33c30d838d4de4a90f` (clean checkout).

## Registrations and re-renders

One tool, one-field stable schema. Ranges cover five trials; calls run ten times per trial.
Owner commits count the component that registers the tool. Status child commits are counted separately; zero owner commits does not mean zero total UI work.

| Metric                               | usewebmcp | @mcp-b/react-webmcp | webmcp-react | use-webmcp-tool |
| ------------------------------------ | --------: | ------------------: | -----------: | --------------: |
| Execution state                      |      none |                none |        owner |            none |
| Registrations on mount               |         1 |                   1 |            2 |               1 |
| Registrations per unrelated update   |         0 |                   0 |            0 |               0 |
| Registrations per description change |         1 |                   1 |            1 |               1 |
| Re-renders per description change    |         1 |                   1 |            1 |               2 |
| Owner commits per sequential call    |         0 |                   0 |          1–2 |               0 |
| Status child commits per call        |         0 |                   0 |            0 |               0 |
| Registrations per call               |         0 |                   0 |            0 |               0 |

## Optional plugins

Same one-tool scenario. Completion is median milliseconds (minimum–maximum) across five trials. All modes add zero registrations during calls.

| Mode                           | Owner commits/call | Status child commits/call |  Completion (ms) |
| ------------------------------ | -----------------: | ------------------------: | ---------------: |
| usewebmcp / state in owner     |                  2 |                         0 | 0.03 (0.02–0.03) |
| usewebmcp / state in child     |                  0 |                         2 | 0.03 (0.02–0.03) |
| usewebmcp / state unsubscribed |                  0 |                         0 | 0.01 (0.01–0.01) |
| usewebmcp / passthrough        |                  0 |                         0 | 0.01 (0.01–0.01) |
| usewebmcp / OTel no-op         |                  0 |                         0 | 0.01 (0.01–0.02) |

Both packages expose one registration-only hook. Optional state is measured with an owner subscription, a status child, and no subscribers; all three record every call. Passthrough adds one named plugin; OTel uses the API's no-op tracer without installing an SDK or exporter. These modes measure local overhead, not production telemetry export. MCP Cat has no separate registration state; Google's hook declares success without awaiting the native promise. The harness waits for native registration in every case.

## Timing method

Cells below show median milliseconds (minimum–maximum) across five trials after one warmup.
Update/call cells summarize each trial's ten sequential operations first. Hook order rotates.
These are browser completion latencies, including scheduling and native registration, not CPU or paint time.
The same one-task asynchronous handler runs in every hook; no network or schema validation is timed.
No `act`, `flushSync`, or development Profiler is used. Settlement waits are excluded from endpoint timestamps.
Cross-origin isolation enables the high-resolution clock; displayed values round to 0.01 ms.
See [methodology](README.md) and [raw samples](production-results.json).

## Mount all tools

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |       webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | -----------------: | ---------------: |
|     1 |             1 | stable         | 0.10 (0.09–0.17) |    0.10 (0.07–0.21) |   0.20 (0.19–0.24) | 0.12 (0.11–0.19) |
|     1 |             1 | inline         | 0.10 (0.08–0.17) |    0.09 (0.07–0.12) |   0.19 (0.12–0.20) | 0.13 (0.08–0.16) |
|     1 |           100 | stable         | 0.12 (0.10–0.18) |    0.13 (0.12–0.23) |   0.19 (0.17–0.24) | 0.13 (0.09–0.18) |
|     1 |           100 | inline         | 0.13 (0.11–0.18) |    0.15 (0.11–0.29) |   0.22 (0.19–0.29) | 0.16 (0.12–0.25) |
|    10 |             1 | stable         | 0.27 (0.23–0.34) |    0.32 (0.25–0.37) |   0.54 (0.43–0.57) | 0.25 (0.24–0.29) |
|    10 |             1 | inline         | 0.31 (0.25–0.34) |    0.30 (0.25–0.32) |   0.56 (0.50–0.63) | 0.28 (0.25–0.33) |
|    10 |           100 | stable         | 0.45 (0.43–0.51) |    0.46 (0.43–0.49) |   0.90 (0.89–1.27) | 0.56 (0.48–0.60) |
|    10 |           100 | inline         | 0.77 (0.72–0.83) |    0.77 (0.71–0.81) |   1.06 (1.04–1.36) | 0.76 (0.70–1.17) |
|   100 |             1 | stable         | 1.79 (1.63–2.48) |    1.75 (1.63–1.99) |   4.02 (3.87–4.95) | 1.71 (1.57–1.87) |
|   100 |             1 | inline         | 2.02 (1.84–2.42) |    1.88 (1.74–2.26) |   4.24 (3.86–4.61) | 1.68 (1.56–1.88) |
|   100 |           100 | stable         | 3.86 (3.62–4.52) |    4.42 (3.56–4.47) |   7.99 (7.48–9.25) | 4.43 (4.01–4.69) |
|   100 |           100 | inline         | 7.02 (6.51–8.06) |    7.14 (6.61–7.88) | 10.13 (9.58–10.36) | 6.38 (6.11–6.93) |

## Unrelated parent update

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.02 (0.01–0.02) |    0.01 (0.01–0.02) | 0.02 (0.01–0.02) | 0.01 (0.01–0.01) |
|     1 |             1 | inline         | 0.02 (0.01–0.02) |    0.01 (0.01–0.02) | 0.02 (0.02–0.02) | 0.01 (0.01–0.02) |
|     1 |           100 | stable         | 0.01 (0.01–0.02) |    0.01 (0.01–0.02) | 0.02 (0.02–0.03) | 0.02 (0.02–0.02) |
|     1 |           100 | inline         | 0.03 (0.03–0.04) |    0.03 (0.03–0.04) | 0.04 (0.03–0.04) | 0.03 (0.03–0.03) |
|    10 |             1 | stable         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.04) | 0.03 (0.02–0.03) |
|    10 |             1 | inline         | 0.04 (0.03–0.04) |    0.04 (0.04–0.04) | 0.04 (0.04–0.04) | 0.03 (0.03–0.03) |
|    10 |           100 | stable         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.11 (0.10–0.11) | 0.10 (0.10–0.10) |
|    10 |           100 | inline         | 0.21 (0.20–0.23) |    0.21 (0.21–0.21) | 0.20 (0.20–0.21) | 0.20 (0.20–0.20) |
|   100 |             1 | stable         | 0.17 (0.17–0.18) |    0.18 (0.18–0.19) | 0.21 (0.20–0.23) | 0.16 (0.16–0.17) |
|   100 |             1 | inline         | 0.23 (0.22–0.24) |    0.23 (0.22–0.25) | 0.22 (0.22–0.25) | 0.19 (0.19–0.21) |
|   100 |           100 | stable         | 0.18 (0.17–0.19) |    0.18 (0.17–0.19) | 0.92 (0.57–1.00) | 0.90 (0.60–1.00) |
|   100 |           100 | inline         | 2.04 (1.97–2.14) |    2.04 (2.03–2.09) | 1.97 (1.94–2.03) | 1.97 (1.82–2.08) |

## Refresh every tool description

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.08 (0.06–0.11) |    0.06 (0.06–0.11) | 0.07 (0.07–0.10) | 0.08 (0.07–0.08) |
|     1 |             1 | inline         | 0.07 (0.06–0.12) |    0.06 (0.06–0.08) | 0.07 (0.05–0.11) | 0.07 (0.06–0.10) |
|     1 |           100 | stable         | 0.07 (0.06–0.14) |    0.09 (0.06–0.12) | 0.08 (0.07–0.12) | 0.08 (0.08–0.11) |
|     1 |           100 | inline         | 0.10 (0.08–0.12) |    0.12 (0.10–0.14) | 0.09 (0.09–0.14) | 0.11 (0.10–0.13) |
|    10 |             1 | stable         | 0.24 (0.22–0.26) |    0.26 (0.21–0.31) | 0.27 (0.23–0.28) | 0.26 (0.24–0.30) |
|    10 |             1 | inline         | 0.25 (0.24–0.27) |    0.27 (0.22–0.34) | 0.30 (0.27–0.33) | 0.27 (0.25–0.30) |
|    10 |           100 | stable         | 0.33 (0.32–0.38) |    0.35 (0.33–0.36) | 0.46 (0.45–0.54) | 0.54 (0.49–0.60) |
|    10 |           100 | inline         | 0.54 (0.51–0.64) |    0.60 (0.55–0.77) | 0.54 (0.51–0.62) | 0.72 (0.71–0.76) |
|   100 |             1 | stable         | 1.88 (1.78–2.12) |    1.96 (1.81–2.23) | 2.19 (2.10–2.51) | 2.08 (1.92–2.70) |
|   100 |             1 | inline         | 2.08 (1.88–2.82) |    1.92 (1.83–2.09) | 2.24 (2.06–2.31) | 2.19 (2.00–2.48) |
|   100 |           100 | stable         | 3.47 (3.26–4.02) |    3.07 (2.86–3.69) | 4.66 (3.91–5.17) | 4.62 (3.73–5.20) |
|   100 |           100 | inline         | 5.26 (5.04–5.95) |    4.91 (4.85–5.95) | 5.03 (4.94–5.32) | 7.08 (6.78–8.33) |

## One sequential tool call, including React updates

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|     1 |             1 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|     1 |           100 | stable         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.04 (0.04–0.04) | 0.00 (0.00–0.00) |
|     1 |           100 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.06 (0.06–0.07) | 0.00 (0.00–0.00) |
|    10 |             1 | stable         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|    10 |             1 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|    10 |           100 | stable         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|    10 |           100 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.02) | 0.06 (0.06–0.07) | 0.00 (0.00–0.00) |
|   100 |             1 | stable         | 0.01 (0.01–0.02) |    0.01 (0.01–0.02) | 0.05 (0.04–0.05) | 0.00 (0.00–0.00) |
|   100 |             1 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|   100 |           100 | stable         | 0.01 (0.01–0.01) |    0.01 (0.01–0.01) | 0.06 (0.06–0.08) | 0.00 (0.00–0.00) |
|   100 |           100 | inline         | 0.01 (0.01–0.02) |    0.01 (0.01–0.02) | 0.09 (0.08–0.11) | 0.00 (0.00–0.00) |
