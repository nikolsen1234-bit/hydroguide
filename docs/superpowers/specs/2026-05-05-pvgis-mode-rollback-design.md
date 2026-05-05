# PVGIS mode rollback design

## Goal

Roll the frontend back to two active modes:

- Calculator (`standard`)
- HydroGuide (`combined`)

PVGIS/detailed mode stays outside the active product flow by commenting out or guarding its activation points. The PVGIS code stays in the repository so it is easy to enable again later.

## Non-goals

- Do not remove PVGIS hooks, calculation utilities, map files, backend API routes, or Worker routes.
- Do not redesign the welcome page.
- Do not change public API semantics.
- Do not deploy as part of this change.

## Current state

The frontend currently models three engine modes:

- `standard`: calculator mode
- `combined`: HydroGuide mode
- `detailed`: PVGIS/advanced mode

`WelcomePage.tsx` exposes all three through `MODE_OPTIONS`. `SystemPage.tsx` enables PVGIS auto solar controls when the mode is `detailed`. `AnalysisPage.tsx` shows advanced simulation/reliability views when the mode is `detailed` or `combined`.

## Proposed design

### Mode selection

`frontend/src/pages/WelcomePage.tsx` should show only `standard` and `combined`.

The `detailed` mode option should remain in the file as a clearly commented-out block with a short note such as:

```ts
// PVGIS/detailed mode is temporarily disabled. Keep this block so it can be
// restored later without rebuilding the mode selector from scratch.
```

### Type and normalization behavior

`frontend/src/types.ts` may keep `EngineMode = "standard" | "detailed" | "combined"` so stored data and dormant code still type-check.

`frontend/src/utils/configuration.ts` should stop actively accepting `detailed` as a normal runtime mode while it is disabled. The old `detailed` branch should be commented or guarded, not deleted. During the disabled period, configs should default to `standard` unless they explicitly use active `combined`.

### PVGIS UI activation

`frontend/src/pages/SystemPage.tsx` should not activate PVGIS automatic solar controls in the normal UI while the mode is disabled.

The existing PVGIS auto-control code should stay in place, but the activation condition should be made inactive or wrapped behind a clearly named disabled flag/comment so it can be re-enabled later.

### Analysis page

`frontend/src/pages/AnalysisPage.tsx` should not expose the PVGIS third flow as a separate active mode.

HydroGuide (`combined`) should continue to show the HydroGuide recommendation/report workflow. Any PVGIS-only advanced simulation display that belongs to `detailed` should be commented/guarded so the active app has only Calculator and HydroGuide.

### Translations

Translation keys for `modeDetailedTitle` and `modeDetailedDesc` stay in place as dormant PVGIS text while the mode is disabled.

## Testing

Run:

- `npm run build` in `frontend`

Manual checks after implementation:

- Welcome page shows exactly two mode buttons: Calculator and HydroGuide.
- No active UI path lets the user select PVGIS/detailed mode.
- Calculator mode remains stripped down.
- HydroGuide mode still reaches recommendation/report flow.
- No source files are deleted as part of PVGIS rollback.

## Re-enable path

To restore PVGIS mode later:

1. Uncomment the `detailed` option in `WelcomePage.tsx`.
2. Re-enable the `detailed` branch in configuration normalization.
3. Re-enable the PVGIS auto-control activation condition in `SystemPage.tsx`.
4. Re-enable any `detailed`-only analysis display in `AnalysisPage.tsx`.
5. Run `npm run build` and verify the PVGIS flow manually.
