import { createApiResponse, handleCorsOptions } from "./_apiUtils.js";

const n = { type: "number" };
const s = { type: "string" };
const b = { type: "boolean" };

const solarSchema = {
  type: "object", required: ["panelPowerWp", "panelCount", "systemEfficiency"],
  description: "Solar panel configuration",
  properties: { panelPowerWp: { ...n, description: "Power per panel (Wp)" }, panelCount: { ...n, description: "Number of panels" }, systemEfficiency: { ...n, description: "System efficiency (0-1)", minimum: 0, maximum: 1 } }
};

const batterySchema = {
  type: "object", required: ["batteryMode", "batteryValue", "nominalVoltage", "maxDepthOfDischarge"],
  description: "Battery configuration. batteryMode and batteryValue can also be sent via systemParameters for backwards compatibility.",
  properties: {
    batteryMode: { type: "string", enum: ["ah", "autonomyDays"], description: "ah = specify capacity directly, autonomyDays = specify desired autonomy in days" },
    batteryValue: { ...n, description: "Capacity in Ah or autonomy in days (depends on batteryMode)" },
    nominalVoltage: { ...n, description: "Nominal battery voltage (V)" },
    maxDepthOfDischarge: { ...n, description: "Max depth of discharge (0-1)", minimum: 0, maximum: 1 }
  }
};

const fuelSourceSchema = {
  type: "object", required: ["purchaseCost", "powerW", "fuelConsumptionPerKWh", "fuelPrice", "lifetime", "annualMaintenance"],
  properties: {
    purchaseCost: { ...n, description: "Purchase cost (NOK)" },
    powerW: { ...n, description: "Power output (W)" },
    fuelConsumptionPerKWh: { ...n, description: "Fuel consumption (l/kWh)" },
    fuelPrice: { ...n, description: "Fuel price (NOK/l)" },
    lifetime: { ...n, description: "Technical lifetime (hours)" },
    annualMaintenance: { ...n, description: "Annual maintenance cost (NOK)" }
  }
};

const backupSourceSchema = {
  type: "object", required: ["hasBackupSource"],
  description: "Backup power source. When hasBackupSource=true, fuelCell, diesel and other must be provided.",
  properties: {
    hasBackupSource: { ...b, description: "Does the system have a backup source?" },
    fuelCell: { ...fuelSourceSchema, description: "Fuel cell (methanol)" },
    diesel: { ...fuelSourceSchema, description: "Diesel generator" }
  }
};

const otherSchema = {
  type: "object", required: ["co2Methanol", "co2Diesel", "evaluationHorizonYears"],
  description: "Economic and environmental parameters. Required when hasBackupSource=true.",
  properties: {
    co2Methanol: { ...n, description: "CO2 factor fuel cell (kg/l)" },
    co2Diesel: { ...n, description: "CO2 factor diesel (kg/l)" },
    evaluationHorizonYears: { ...n, description: "Evaluation horizon (years)" }
  }
};

const monthlySchema = {
  type: "object", required: ["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "nov"],
  description: "Monthly solar radiation (kWh/m2/day). May/October/December may be sent as mai/okt/des or may/oct/dec.",
  properties: { jan: n, feb: n, mar: n, apr: n, mai: n, may: n, jun: n, jul: n, aug: n, sep: n, okt: n, oct: n, nov: n, des: n, dec: n }
};

const equipmentRowSchema = {
  type: "object", required: ["active", "name", "powerW", "runtimeHoursPerDay"],
  properties: {
    active: { ...b, description: "Is the row active?" },
    name: { ...s, description: "Equipment name" },
    powerW: { ...n, description: "Power (W)" },
    runtimeHoursPerDay: { ...n, description: "Runtime hours per day (0-24)", minimum: 0, maximum: 24 }
  }
};

const equipmentBudgetRowSchema = {
  type: "object",
  properties: { id: s, active: b, name: s, powerW: n, currentA: n, runtimeHoursPerDay: n, whPerDay: n, ahPerDay: n, whPerMonth: n, ahPerMonth: n, whPerWeek: n, ahPerWeek: n }
};

const monthlyBalanceSchema = {
  type: "object",
  properties: { month: s, label: s, daysInMonth: n, solarProductionKWh: n, loadDemandKWh: n, energyBalanceKWh: n, secondaryRuntimeHours: n, fuelLiters: n, fuelCost: n }
};

const costItemSchema = {
  type: "object",
  properties: { source: s, purchaseCost: n, operatingCostPerYear: n, annualMaintenance: n, evaluationHorizonYears: n, technicalLifetimeHours: n, totalRuntimeHours: n, replacementCount: n, annualFuelConsumption: n, annualCo2: n, toc: { ...n, description: "Total cost of ownership over evaluation period (NOK)" } }
};

const scenarioSchema = {
  type: "object",
  properties: { source: s, monthlyEnergyBalance: { type: "array", items: monthlyBalanceSchema }, annualTotals: { type: "object" }, secondarySourcePowerW: n, costItem: costItemSchema }
};

const calculationsResponseSchema = {
  type: "object",
  properties: {
    equipmentBudgetRows: { type: "array", items: equipmentBudgetRowSchema, description: "Power budget per equipment row" },
    totals: { type: "object", properties: { totalWhPerDay: n, totalAhPerDay: n, totalWhPerWeek: n, totalAhPerWeek: n }, description: "Total consumption" },
    battery: { type: "object", properties: { inputMode: s, inputValue: n, capacityAh: n, autonomyDays: n }, description: "Battery result" },
    annualEnergyDeficitKWh: { ...n, description: "Annual energy deficit (kWh)" },
    monthlyEnergyBalance: { type: "array", items: monthlyBalanceSchema, description: "Energy balance per month" },
    annualTotals: { type: "object", description: "Annual totals for solar production, load, balance, fuel and CO2" },
    selectedSource: { ...s, description: "Selected reserve source for monthlyEnergyBalance and annualTotals" },
    costComparison: { type: "object", properties: { annualEnergyDeficitKWh: n, alternatives: { type: "array", items: costItemSchema } }, description: "Cost comparison fuel cell vs diesel" },
    scenarios: { type: "object", properties: { fuelCell: scenarioSchema, diesel: scenarioSchema }, description: "Full scenario for each backup source" }
  }
};

const nveidPathParameter = {
  name: "NVEID",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 },
  description: "NVE power station ID"
};

const nullableNumber = { oneOf: [n, { type: "null" }] };
const nullableString = { oneOf: [s, { type: "null" }] };

const nveidPeriodSchema = {
  type: "object",
  required: ["ls", "periode", "note"],
  properties: {
    ls: nullableNumber,
    periode: nullableString,
    note: nullableString
  }
};

const nveidIntakeSchema = {
  type: "object",
  required: ["inntakFunksjon", "perioder"],
  properties: {
    inntakFunksjon: nullableString,
    perioder: { type: "array", items: nveidPeriodSchema }
  }
};

const nveidStationSchema = {
  type: "object",
  required: ["navn", "funnet", "url", "inntak"],
  properties: {
    navn: s,
    funnet: b,
    url: nullableString,
    inntak: { type: "array", items: nveidIntakeSchema }
  }
};

const nveidResponseSchema = {
  type: "object",
  description: "Minimum-flow data for the requested power station.",
  additionalProperties: nveidStationSchema
};

const nveidResponseExample = {
  "1696": {
    url: "https://www.nve.no/kdb/sc1696.pdf",
    navn: "Hynna",
    funnet: true,
    inntak: [
      {
        inntakFunksjon: "Hovedinntak",
        perioder: [
          { ls: 150, periode: "01.05 - 30.09", note: null }
        ]
      }
    ]
  }
};

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "HydroGuide API",
    version: "1.0.0",
    description: "Public API for HydroGuide calculations and minimum-flow data."
  },
  servers: [{ url: "/api" }],
  tags: [
    { name: "Calculations", description: "Energy calculations" },
    { name: "NVEID", description: "Minimum-flow data by NVEID" }
  ],
  paths: {
    "/NVEID/{NVEID}": {
      get: {
        tags: ["NVEID"],
        summary: "Get minimum-flow data by NVEID",
        description: "Returns minimum-flow data for the requested power station.",
        parameters: [nveidPathParameter],
        responses: {
          "200": { description: "Minimum-flow data", content: { "application/json": { schema: { $ref: "#/components/schemas/NveidResponse" }, example: nveidResponseExample } } },
          "400": { description: "Invalid NVEID" },
          "404": { description: "No data for NVEID" },
          "503": { description: "Minimum-flow data unavailable" }
        }
      }
    },
    "/calculations": {
      post: {
        tags: ["Calculations"],
        summary: "Run calculations",
        description: "Send the same payload as the website export file. systemParameters/systemparametere and may/oct/dec or mai/okt/des month keys are accepted. Backup source fields (fuelCell, diesel, other) are required when hasBackupSource=true.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CalculationsRequest" } } }
        },
        responses: {
          "200": { description: "Successful calculation", content: { "application/json": { schema: { $ref: "#/components/schemas/CalculationsResponse" } } } },
          "400": { description: "Invalid request (bad JSON, empty body, too large)" },
          "401": { description: "Invalid or missing API key" },
          "422": { description: "Validation error. Field keys in validationErrors show what is missing.", content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } } },
          "429": { description: "Rate limited. retry-after header indicates wait time." }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "API key" }
    },
    schemas: {
      CalculationsRequest: {
        type: "object",
        required: ["solar", "battery", "monthlySolarRadiation", "equipmentRows"],
        properties: {
          solar: solarSchema,
          battery: batterySchema,
          backupSource: backupSourceSchema,
          other: otherSchema,
          monthlySolarRadiation: monthlySchema,
          equipmentRows: { type: "array", items: equipmentRowSchema, description: "Equipment list. Max 200 rows." }
        }
      },
      CalculationsResponse: {
        type: "object",
        properties: {
          calculations: calculationsResponseSchema,
          usage: { type: "object", properties: { requests_remaining: { type: "integer" }, reset_at: { type: "string", format: "date-time" } } }
        }
      },
      NveidResponse: nveidResponseSchema,
      ValidationError: {
        type: "object",
        properties: { error: s, validationErrors: { type: "object", additionalProperties: s }, usage: { type: "object" } }
      }
    }
  }
};

const SWAGGER_CSS_SRI = "sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW";
const SWAGGER_JS_SRI = "sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ";
const INLINE_SCRIPT = `SwaggerUIBundle({url:"/api/openapi",dom_id:"#s",deepLinking:true,docExpansion:"list",defaultModelRendering:"model",defaultModelExpandDepth:3,defaultModelsExpandDepth:2})`;

function buildUiHtml(nonce) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HydroGuide API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" integrity="${SWAGGER_CSS_SRI}" crossorigin="anonymous">
<style>html,body{margin:0;background:#fff;overflow-x:hidden}#s{min-height:100vh}.swagger-ui .wrapper{max-width:none!important;padding:0 24px}.swagger-ui .information-container.wrapper{padding-top:16px}.swagger-ui .example,.swagger-ui .body-param__example,.swagger-ui .model-example,.swagger-ui .tab li.tabitem:first-child{display:none!important}@media(max-width:640px){.swagger-ui,.swagger-ui *{box-sizing:border-box}.swagger-ui .wrapper{max-width:100%!important;padding:0 12px!important}.swagger-ui .info{margin:24px 0!important}.swagger-ui .info .title{display:flex!important;max-width:100%;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:30px!important;line-height:1.1!important;overflow-wrap:anywhere}.swagger-ui .info p{max-width:100%;white-space:normal;overflow-wrap:anywhere}.swagger-ui .scheme-container{padding:16px 0!important}.swagger-ui .scheme-container .wrapper{display:block!important}.swagger-ui .schemes-server-container,.swagger-ui .auth-wrapper{float:none!important;display:flex!important;max-width:100%;flex-wrap:wrap;align-items:center;gap:10px}.swagger-ui .auth-wrapper{width:100%!important;justify-content:flex-start!important;margin-top:12px}.swagger-ui .auth-wrapper .authorize{max-width:100%}.swagger-ui .opblock .opblock-summary{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;gap:6px;align-items:center}.swagger-ui .opblock-summary-path{min-width:0!important;max-width:none!important;white-space:normal!important;overflow-wrap:anywhere}.swagger-ui .opblock-summary-description{grid-column:2/4;white-space:normal!important}.swagger-ui .models,.swagger-ui .model-container,.swagger-ui table{max-width:100%;overflow-x:auto}.swagger-ui .model-box{min-width:0!important}}</style></head>
<body><div id="s"></div><script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" integrity="${SWAGGER_JS_SRI}" crossorigin="anonymous"></script>
<script nonce="${nonce}">${INLINE_SCRIPT}</script></body></html>`;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (!url.searchParams.has("openapi") && url.pathname !== "/api/openapi") {
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    return new Response(buildUiHtml(nonce), {
      headers: {
        "content-type": "text/html;charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'none'; script-src https://unpkg.com 'nonce-${nonce}'; style-src https://unpkg.com 'unsafe-inline'; img-src 'self' data:; font-src https://unpkg.com; connect-src 'self' https://unpkg.com; frame-ancestors 'self'`,
        "x-frame-options": "SAMEORIGIN",
        "x-content-type-options": "nosniff",
        "referrer-policy": "same-origin"
      }
    });
  }
  return createApiResponse(SPEC, { cacheControl: "no-store" });
}

export async function onRequestOptions() {
  return handleCorsOptions();
}
