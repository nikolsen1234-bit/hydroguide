# Typography Standard Design

## Goal

HydroGuide should use at most 10 unique typography variants across `frontend/src`.
The three core content levels are included in that total.

## Scope

This pass standardizes workspace/page content typography across the frontend, with the analysis page as the first target because it currently exposes the problem most clearly.

Status colors may remain different when the size, weight, and line height stay the same.

Chart text should also be standardized where the same chart concept appears on more than one page. The front page and analysis page must use the same typography for chart numbers and month labels.

## Typography Levels

The standard content hierarchy follows the working Radiolinje design:

1. Level 1: section title
   Examples: `Lokasjonar`, `Månad for månad`
2. Level 2: category, row title, or group title
   Examples: `Lokasjon A`, `Solproduksjon / år (kWh)`, `Brenselcelle`, `Dieselaggregat`, `Innkjøp`
3. Level 3: value or content text
   Examples: `60.61540, 5.80658`, `296,32 kWh`, `149 038,55 kr`, `10 års analyse`, `Røyrslipp i frostfritt rom med aktiv reguleringsventil`

## Allowed Total

The final frontend typography budget is:

1. Level 1 content title
2. Level 2 content category
3. Level 3 content value
4. Button text
5. Input/form text
6. Navigation/menu text
7. Tooltip text
8. Small helper/meta text
9. Chart/SVG text
10. One reserved special case, only if still necessary after cleanup

## Implementation Shape

Shared typography classes live in the workspace style module. Page-local constants and hardcoded `text-*`, `font-*`, and `leading-*` combinations should be replaced with those shared exports where they represent the same content level.

The analysis page should map all normal content to the three core levels:

- Workspace section headers use Level 1.
- Metric labels, month names, table row labels, and group names use Level 2.
- Numbers, descriptions, coordinates, costs, `10 års analyse`, and other displayed content use Level 3.
- Energy balance values use the Level 3 base typography plus the existing positive/negative color.
- Chart numbers and chart month labels use the shared chart typography on both the front page and analysis page.

## Verification

After implementation:

- Count unique typography tokens in `frontend/src`.
- Confirm the count is 10 or less, excluding only non-typography color changes.
- Confirm chart numbers and month labels match on the front page and analysis page.
- Run `npm.cmd run build`.
- Keep the local session available for visual review before any deployment.
