# Production browser measurements

Generated 2026-09-06T02:43:29.789Z. React 19.2.8, Chrome 155.0.8043.0, darwin/arm64, Apple M3 Max.
Hook source: `e4bc3510295d19fdd8653b47a9694b0bfe8c8819`.

## Registrations and re-renders

One tool, one-field stable schema. Ranges cover five trials; calls run ten times per trial.
The README chart uses these production counts.

| Metric                               | usewebmcp | @mcp-b/react-webmcp | webmcp-react |    use-webmcp-tool |
| ------------------------------------ | --------: | ------------------: | -----------: | -----------------: |
| Registrations on mount               |         1 |                   1 |            2 |                  1 |
| Registrations per unrelated update   |         0 |                   0 |            0 |                  0 |
| Registrations per description change |         1 |                   1 |            1 |                  1 |
| Re-renders per description change    |         1 |                   1 |            1 |                  2 |
| Re-renders per sequential call       |         2 |                   2 |          1–2 | No execution state |

Our hooks expose registration errors without pending/success state. MCP Cat has no separate registration state; Google's hook declares success without awaiting the native promise. The harness waits for native registration in every case.

## Timing method

Cells below show median milliseconds (minimum–maximum) across five trials after one warmup.
Update/call cells summarize each trial's ten sequential operations first. Hook order rotates.
These are browser completion latencies, including scheduling and native registration, not CPU or paint time.
The same one-task asynchronous handler runs in every hook; no network or schema validation is timed.
No `act`, `flushSync`, or development Profiler is used. Settlement waits are excluded from endpoint timestamps.
Cross-origin isolation enables the high-resolution clock; displayed values round to 0.01 ms.
See [methodology](README.md) and [raw samples](production-results.json).

## Mount all tools

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |      webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ----------------: | ---------------: |
|     1 |             1 | stable         | 0.09 (0.07–0.09) |    0.10 (0.07–0.16) |  0.21 (0.13–0.36) | 0.11 (0.07–0.11) |
|     1 |             1 | inline         | 0.12 (0.07–0.13) |    0.08 (0.08–0.11) |  0.14 (0.13–0.19) | 0.08 (0.07–0.09) |
|     1 |           100 | stable         | 0.09 (0.09–0.11) |    0.10 (0.09–0.13) |  0.19 (0.15–0.21) | 0.11 (0.09–0.12) |
|     1 |           100 | inline         | 0.13 (0.11–0.13) |    0.12 (0.12–0.13) |  0.19 (0.19–0.19) | 0.14 (0.12–0.17) |
|    10 |             1 | stable         | 0.24 (0.21–0.28) |    0.24 (0.22–0.28) |  0.51 (0.47–0.56) | 0.23 (0.22–0.25) |
|    10 |             1 | inline         | 0.24 (0.23–0.25) |    0.26 (0.23–0.28) |  0.50 (0.46–0.53) | 0.24 (0.22–0.27) |
|    10 |           100 | stable         | 0.44 (0.41–0.48) |    0.44 (0.42–0.44) |  0.87 (0.87–0.95) | 0.50 (0.48–0.50) |
|    10 |           100 | inline         | 0.69 (0.69–0.70) |    0.73 (0.69–0.78) |  1.07 (1.03–1.11) | 0.67 (0.64–0.69) |
|   100 |             1 | stable         | 1.74 (1.61–1.93) |    1.81 (1.62–1.86) |  3.90 (3.74–4.81) | 1.72 (1.53–1.74) |
|   100 |             1 | inline         | 1.81 (1.69–2.06) |    1.78 (1.66–1.89) |  4.35 (4.01–4.92) | 1.67 (1.56–1.88) |
|   100 |           100 | stable         | 3.90 (3.75–4.22) |    3.83 (3.69–4.10) |  8.53 (8.27–8.68) | 4.34 (4.11–5.07) |
|   100 |           100 | inline         | 6.38 (6.08–6.70) |    6.80 (6.35–7.29) | 9.82 (9.56–10.25) | 6.31 (5.86–7.19) |

## Unrelated parent update

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.02 (0.01–0.02) |    0.01 (0.01–0.02) | 0.02 (0.01–0.02) | 0.01 (0.01–0.02) |
|     1 |             1 | inline         | 0.01 (0.01–0.02) |    0.02 (0.01–0.02) | 0.02 (0.01–0.02) | 0.02 (0.01–0.02) |
|     1 |           100 | stable         | 0.01 (0.01–0.02) |    0.02 (0.01–0.02) | 0.02 (0.02–0.03) | 0.02 (0.02–0.02) |
|     1 |           100 | inline         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.03 (0.03–0.04) |
|    10 |             1 | stable         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.03 (0.03–0.03) |
|    10 |             1 | inline         | 0.03 (0.03–0.04) |    0.03 (0.03–0.04) | 0.03 (0.03–0.04) | 0.03 (0.03–0.03) |
|    10 |           100 | stable         | 0.03 (0.03–0.04) |    0.03 (0.03–0.03) | 0.10 (0.09–0.11) | 0.10 (0.09–0.10) |
|    10 |           100 | inline         | 0.21 (0.19–0.21) |    0.20 (0.19–0.21) | 0.19 (0.19–0.20) | 0.19 (0.18–0.20) |
|   100 |             1 | stable         | 0.18 (0.18–0.19) |    0.18 (0.17–0.21) | 0.19 (0.18–0.20) | 0.15 (0.15–0.16) |
|   100 |             1 | inline         | 0.22 (0.22–0.25) |    0.22 (0.22–0.25) | 0.22 (0.21–0.22) | 0.18 (0.17–0.19) |
|   100 |           100 | stable         | 0.18 (0.17–0.19) |    0.18 (0.17–0.18) | 0.88 (0.86–1.11) | 0.81 (0.50–0.84) |
|   100 |           100 | inline         | 1.92 (1.87–1.95) |    1.87 (1.85–1.91) | 1.84 (1.83–1.89) | 1.86 (1.82–1.90) |

## Refresh every tool description

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.07 (0.06–0.08) |    0.07 (0.06–0.08) | 0.07 (0.06–0.09) | 0.08 (0.07–0.09) |
|     1 |             1 | inline         | 0.07 (0.06–0.08) |    0.07 (0.06–0.13) | 0.06 (0.06–0.09) | 0.07 (0.06–0.31) |
|     1 |           100 | stable         | 0.08 (0.06–0.09) |    0.08 (0.07–0.08) | 0.09 (0.08–0.10) | 0.09 (0.08–0.09) |
|     1 |           100 | inline         | 0.09 (0.09–0.10) |    0.09 (0.09–0.10) | 0.10 (0.09–0.12) | 0.11 (0.10–0.12) |
|    10 |             1 | stable         | 0.23 (0.21–0.26) |    0.23 (0.21–0.25) | 0.27 (0.25–0.34) | 0.27 (0.25–0.29) |
|    10 |             1 | inline         | 0.25 (0.23–0.25) |    0.25 (0.22–0.27) | 0.27 (0.25–0.35) | 0.26 (0.25–0.28) |
|    10 |           100 | stable         | 0.36 (0.34–0.38) |    0.35 (0.34–0.38) | 0.46 (0.44–0.71) | 0.51 (0.49–0.55) |
|    10 |           100 | inline         | 0.53 (0.50–0.55) |    0.53 (0.52–0.56) | 0.54 (0.53–0.58) | 0.70 (0.68–0.85) |
|   100 |             1 | stable         | 2.06 (1.93–2.19) |    2.09 (1.89–2.35) | 2.25 (2.09–2.47) | 2.16 (1.98–2.68) |
|   100 |             1 | inline         | 2.09 (1.90–2.65) |    2.12 (1.94–2.22) | 2.19 (2.14–2.86) | 2.26 (2.00–2.79) |
|   100 |           100 | stable         | 3.30 (3.09–3.52) |    3.26 (3.10–3.31) | 4.19 (3.97–5.13) | 4.66 (4.23–4.88) |
|   100 |           100 | inline         | 5.11 (4.91–5.19) |    5.05 (4.83–5.92) | 5.36 (5.14–5.85) | 6.94 (6.59–7.82) |

## One sequential tool call, including React updates

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.03 (0.02–0.03) |    0.03 (0.03–0.03) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|     1 |             1 | inline         | 0.03 (0.02–0.03) |    0.03 (0.03–0.03) | 0.03 (0.02–0.03) | 0.00 (0.00–0.01) |
|     1 |           100 | stable         | 0.03 (0.02–0.03) |    0.03 (0.03–0.03) | 0.04 (0.03–0.04) | 0.00 (0.00–0.00) |
|     1 |           100 | inline         | 0.06 (0.06–0.06) |    0.06 (0.06–0.06) | 0.06 (0.05–0.06) | 0.00 (0.00–0.00) |
|    10 |             1 | stable         | 0.03 (0.02–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.00 (0.00–0.01) |
|    10 |             1 | inline         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.00 (0.00–0.00) |
|    10 |           100 | stable         | 0.03 (0.02–0.03) |    0.03 (0.03–0.03) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|    10 |           100 | inline         | 0.06 (0.06–0.06) |    0.06 (0.06–0.06) | 0.06 (0.06–0.07) | 0.00 (0.00–0.00) |
|   100 |             1 | stable         | 0.04 (0.03–0.05) |    0.04 (0.04–0.04) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|   100 |             1 | inline         | 0.04 (0.04–0.04) |    0.04 (0.03–0.04) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|   100 |           100 | stable         | 0.04 (0.03–0.04) |    0.04 (0.04–0.05) | 0.06 (0.05–0.07) | 0.00 (0.00–0.00) |
|   100 |           100 | inline         | 0.08 (0.08–0.09) |    0.08 (0.08–0.09) | 0.08 (0.08–0.09) | 0.00 (0.00–0.00) |
