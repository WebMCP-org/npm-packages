# Production browser measurements

Generated 2026-09-06T02:06:35.930Z. React 19.2.8, Chrome 155.0.8043.0, darwin/arm64, Apple M3 Max.
Hook source: `93d574b2d2d6cf402c2e3b0d4ccec26a3c9f3389`.

## Registrations and re-renders

One tool, one-field stable schema. Ranges cover five trials; calls run ten times per trial.
The README chart uses these production counts.

| Metric                               | usewebmcp | @mcp-b/react-webmcp | webmcp-react |    use-webmcp-tool |
| ------------------------------------ | --------: | ------------------: | -----------: | -----------------: |
| Registrations on mount               |         1 |                   1 |            2 |                  1 |
| Registrations per unrelated update   |         0 |                   0 |            0 |                  0 |
| Registrations per description change |         1 |                   1 |            1 |                  1 |
| Re-renders per description change    |         3 |                   3 |            1 |                  2 |
| Re-renders per sequential call       |         2 |                   2 |          1–2 | No execution state |

Our metadata counts include pending and completed native registration. MCP Cat exposes no registration status; Google's hook declares success without awaiting the native promise.

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
|     1 |             1 | stable         | 0.12 (0.08–0.16) |    0.13 (0.12–0.15) |  0.15 (0.13–0.18) | 0.08 (0.07–0.13) |
|     1 |             1 | inline         | 0.09 (0.09–0.10) |    0.10 (0.09–0.11) |  0.13 (0.11–0.14) | 0.09 (0.07–0.23) |
|     1 |           100 | stable         | 0.13 (0.12–0.14) |    0.12 (0.11–0.16) |  0.17 (0.16–0.20) | 0.09 (0.08–0.11) |
|     1 |           100 | inline         | 0.15 (0.13–0.18) |    0.16 (0.13–0.17) |  0.20 (0.18–0.23) | 0.11 (0.11–0.17) |
|    10 |             1 | stable         | 0.28 (0.27–0.45) |    0.27 (0.26–0.28) |  0.52 (0.47–0.61) | 0.22 (0.20–0.24) |
|    10 |             1 | inline         | 0.27 (0.27–0.28) |    0.28 (0.28–0.28) |  0.49 (0.45–0.50) | 0.22 (0.21–0.25) |
|    10 |           100 | stable         | 0.57 (0.56–0.58) |    0.57 (0.56–0.74) |  0.85 (0.81–0.87) | 0.46 (0.46–0.74) |
|    10 |           100 | inline         | 0.83 (0.80–0.85) |    0.83 (0.81–0.91) |  1.03 (0.98–1.18) | 0.65 (0.63–0.94) |
|   100 |             1 | stable         | 2.01 (1.82–2.10) |    1.98 (1.94–2.07) |  4.49 (3.60–4.63) | 1.67 (1.50–1.85) |
|   100 |             1 | inline         | 2.05 (1.92–2.44) |    2.06 (1.89–2.07) |  4.02 (3.62–4.22) | 1.65 (1.45–1.68) |
|   100 |           100 | stable         | 5.31 (5.21–6.02) |    5.66 (5.19–6.09) |  7.63 (7.56–8.09) | 4.20 (4.09–4.64) |
|   100 |           100 | inline         | 8.63 (8.37–9.29) |    8.40 (7.95–9.02) | 9.91 (9.49–10.28) | 6.23 (5.97–6.53) |

## Unrelated parent update

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.02 (0.01–0.02) |    0.01 (0.01–0.02) | 0.02 (0.01–0.02) | 0.01 (0.01–0.02) |
|     1 |             1 | inline         | 0.01 (0.01–0.01) |    0.01 (0.01–0.02) | 0.02 (0.01–0.02) | 0.01 (0.01–0.01) |
|     1 |           100 | stable         | 0.02 (0.02–0.02) |    0.02 (0.02–0.03) | 0.02 (0.02–0.02) | 0.02 (0.02–0.02) |
|     1 |           100 | inline         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.03 (0.03–0.03) |
|    10 |             1 | stable         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.03 (0.02–0.03) |
|    10 |             1 | inline         | 0.03 (0.03–0.03) |    0.03 (0.03–0.03) | 0.03 (0.03–0.03) | 0.03 (0.02–0.03) |
|    10 |           100 | stable         | 0.09 (0.09–0.09) |    0.09 (0.09–0.10) | 0.09 (0.09–0.09) | 0.09 (0.09–0.10) |
|    10 |           100 | inline         | 0.19 (0.19–0.21) |    0.19 (0.19–0.19) | 0.19 (0.19–0.19) | 0.19 (0.18–0.19) |
|   100 |             1 | stable         | 0.19 (0.19–0.20) |    0.19 (0.19–0.22) | 0.19 (0.19–0.34) | 0.15 (0.15–0.16) |
|   100 |             1 | inline         | 0.21 (0.20–0.21) |    0.21 (0.21–0.21) | 0.21 (0.21–0.22) | 0.17 (0.17–0.18) |
|   100 |           100 | stable         | 0.83 (0.82–0.85) |    0.83 (0.81–0.86) | 0.82 (0.82–0.84) | 0.79 (0.50–0.81) |
|   100 |           100 | inline         | 1.80 (1.77–1.87) |    1.78 (1.77–1.91) | 1.78 (1.75–3.88) | 1.74 (1.70–1.77) |

## Refresh every tool description

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.08 (0.07–0.10) |    0.09 (0.08–0.10) | 0.06 (0.05–0.08) | 0.07 (0.06–0.08) |
|     1 |             1 | inline         | 0.08 (0.08–0.09) |    0.08 (0.07–0.09) | 0.06 (0.06–0.08) | 0.06 (0.05–0.07) |
|     1 |           100 | stable         | 0.11 (0.10–0.12) |    0.11 (0.11–0.12) | 0.09 (0.08–0.10) | 0.08 (0.07–0.09) |
|     1 |           100 | inline         | 0.14 (0.13–0.14) |    0.13 (0.13–0.14) | 0.09 (0.09–0.10) | 0.10 (0.09–0.11) |
|    10 |             1 | stable         | 0.31 (0.29–0.37) |    0.30 (0.29–0.31) | 0.27 (0.25–0.28) | 0.26 (0.23–0.28) |
|    10 |             1 | inline         | 0.31 (0.28–0.31) |    0.31 (0.28–0.31) | 0.27 (0.24–0.29) | 0.25 (0.23–0.25) |
|    10 |           100 | stable         | 0.61 (0.60–0.63) |    0.61 (0.59–0.63) | 0.44 (0.43–0.46) | 0.50 (0.49–0.52) |
|    10 |           100 | inline         | 0.90 (0.88–0.95) |    0.90 (0.87–0.94) | 0.53 (0.52–0.57) | 0.69 (0.67–0.71) |
|   100 |             1 | stable         | 2.40 (2.27–2.88) |    2.45 (2.37–2.50) | 2.32 (2.05–2.76) | 2.06 (1.87–2.17) |
|   100 |             1 | inline         | 2.50 (2.32–2.50) |    2.50 (2.40–2.91) | 2.35 (2.09–2.76) | 2.11 (2.07–2.33) |
|   100 |           100 | stable         | 5.61 (5.55–6.29) |    5.58 (5.42–6.28) | 4.06 (4.03–4.22) | 4.63 (3.80–5.02) |
|   100 |           100 | inline         | 8.69 (8.45–9.14) |    8.40 (8.38–8.69) | 5.07 (5.02–7.66) | 6.45 (6.36–7.03) |

## One sequential tool call, including React updates

| Tools | Schema fields | Schema objects |        usewebmcp | @mcp-b/react-webmcp |     webmcp-react |  use-webmcp-tool |
| ----: | ------------: | -------------- | ---------------: | ------------------: | ---------------: | ---------------: |
|     1 |             1 | stable         | 0.03 (0.02–0.03) |    0.03 (0.02–0.03) | 0.02 (0.02–0.03) | 0.00 (0.00–0.00) |
|     1 |             1 | inline         | 0.02 (0.02–0.03) |    0.03 (0.02–0.03) | 0.02 (0.02–0.03) | 0.00 (0.00–0.00) |
|     1 |           100 | stable         | 0.04 (0.03–0.04) |    0.04 (0.03–0.04) | 0.04 (0.03–0.04) | 0.00 (0.00–0.00) |
|     1 |           100 | inline         | 0.05 (0.05–0.06) |    0.06 (0.05–0.06) | 0.06 (0.05–0.06) | 0.00 (0.00–0.00) |
|    10 |             1 | stable         | 0.03 (0.02–0.03) |    0.03 (0.02–0.03) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|    10 |             1 | inline         | 0.03 (0.02–0.03) |    0.03 (0.02–0.03) | 0.03 (0.02–0.03) | 0.00 (0.00–0.00) |
|    10 |           100 | stable         | 0.04 (0.04–0.04) |    0.04 (0.04–0.04) | 0.04 (0.03–0.04) | 0.00 (0.00–0.00) |
|    10 |           100 | inline         | 0.06 (0.06–0.06) |    0.06 (0.06–0.06) | 0.06 (0.06–0.06) | 0.00 (0.00–0.00) |
|   100 |             1 | stable         | 0.03 (0.03–0.04) |    0.03 (0.03–0.04) | 0.04 (0.04–0.05) | 0.00 (0.00–0.00) |
|   100 |             1 | inline         | 0.04 (0.04–0.04) |    0.04 (0.03–0.05) | 0.04 (0.04–0.04) | 0.00 (0.00–0.00) |
|   100 |           100 | stable         | 0.05 (0.05–0.06) |    0.06 (0.05–0.06) | 0.05 (0.05–0.06) | 0.00 (0.00–0.00) |
|   100 |           100 | inline         | 0.08 (0.07–0.09) |    0.09 (0.08–0.09) | 0.09 (0.08–0.09) | 0.00 (0.00–0.00) |
