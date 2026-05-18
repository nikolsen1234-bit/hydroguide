import { useEffect, useRef } from "react";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { useMemo } from "react";
import EditorialSection from "../components/EditorialSection";
import { useLanguage } from "../i18n";
import type { TranslationKey } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceContentValueBaseClassName,
  workspacePageClassName,
  workspaceSubsectionTitleClassName
} from "../styles/workspace";

let mathJaxLoader: Promise<void> | null = null;

type MathJaxApi = {
  options?: unknown;
  startup?: {
    promise?: Promise<unknown>;
    typeset?: boolean;
  };
  svg?: unknown;
  tex?: unknown;
  typesetClear?: (elements?: HTMLElement[]) => void;
  typesetPromise?: (elements?: HTMLElement[]) => Promise<unknown>;
};

type MathJaxWindow = Window & typeof globalThis & {
  MathJax?: MathJaxApi;
};

type FormulaItem = {
  symbol: string;
  unit?: string;
  description: string;
};

type FormulaEntry = {
  title: string;
  lead: string;
  formula?: string;
  items?: FormulaItem[];
};

type DocSection = {
  title: string;
  description: string;
  entries: FormulaEntry[];
};

function buildSections(t: (key: TranslationKey) => string): DocSection[] {
  return [
    {
      title: t("docs.powerBudget"),
      description: "",
      entries: [
        {
          title: t("docs.dailyEntry"),
          lead: t("docs.dailyEntryLead"),
          formula: String.raw`\displaystyle
E_{dag} = P \cdot t`,
          items: [
            { symbol: "E_{dag}", unit: "\\mathrm{Wh}", description: t("docs.dailyConsumption") },
            { symbol: "P", unit: "\\mathrm{W}", description: t("docs.power") },
            { symbol: "t", unit: "\\mathrm{h}", description: t("docs.hoursPerDay") }
          ]
        }
      ]
    },
    {
      title: t("docs.energyBalance"),
      description: "",
      entries: [
        {
          title: t("docs.solarProduction"),
          lead: t("docs.solarProductionLead"),
          formula: String.raw`\displaystyle
E_{prod} = G \cdot P_{panel} \cdot n \cdot \eta`,
          items: [
            { symbol: "E_{prod}", unit: "\\mathrm{kWh}", description: t("docs.solarProductionSymbol") },
            { symbol: "G", unit: "\\mathrm{kWh}/\\mathrm{m}^2", description: t("docs.solarRadiation") },
            { symbol: "P_{panel}", unit: "\\mathrm{kW}", description: t("docs.panelPower") },
            { symbol: "n", unit: "\\text{stk}", description: t("docs.panelCount") },
            { symbol: "\\eta", description: t("docs.systemEfficiency") }
          ]
        },
        {
          title: t("docs.energyBalanceTitle"),
          lead: t("docs.energyBalanceLead"),
          formula: String.raw`\displaystyle
E_{bal} = E_{prod} - E_{forbruk}`,
          items: [
            { symbol: "E_{bal}", unit: "\\mathrm{kWh}", description: t("docs.energyBalanceSymbol") },
            { symbol: "E_{prod}", unit: "\\mathrm{kWh}", description: t("docs.solarProductionSymbol") },
            { symbol: "E_{forbruk}", unit: "\\mathrm{kWh}", description: t("docs.totalConsumption") }
          ]
        },
        {
          title: t("docs.runtimeHours"),
          lead: t("docs.runtimeHoursLead"),
          formula: String.raw`\displaystyle
t_{drift} = \frac{E_{underskudd}}{P_{sek}}`,
          items: [
            { symbol: "t_{drift}", unit: "\\mathrm{h}", description: t("docs.runtimeHoursSymbol") },
            { symbol: "E_{underskudd}", unit: "\\mathrm{kWh}", description: t("docs.energyDeficitSymbol") },
            { symbol: "P_{sek}", unit: "\\mathrm{kW}", description: t("docs.secondaryPower") }
          ]
        },
        {
          title: "Drivstofforbruk",
          lead: t("docs.fuelConsumptionLead"),
          formula: String.raw`\displaystyle
F = E_{underskudd} \cdot r_{forbruk}`,
          items: [
            { symbol: "F", unit: "\\mathrm{L}", description: t("docs.fuelSymbol") },
            { symbol: "E_{underskudd}", unit: "\\mathrm{kWh}", description: t("docs.energyDeficitSymbol") },
            { symbol: "r_{forbruk}", unit: "\\mathrm{L}/\\mathrm{kWh}", description: t("docs.consumptionRate") }
          ]
        },
        {
          title: "Drivstoffkostnader",
          lead: "",
          formula: String.raw`\displaystyle
C_{drivstoff} = F \cdot p_{drivstoff}`,
          items: [
            { symbol: "C_{drivstoff}", unit: "\\mathrm{kr}", description: t("docs.fuelCost") },
            { symbol: "F", unit: "\\mathrm{L}", description: t("docs.fuelSymbol") },
            { symbol: "p_{drivstoff}", unit: "\\mathrm{kr}/\\mathrm{L}", description: t("docs.fuelPriceSymbol") }
          ]
        }
      ]
    },
    {
      title: t("docs.batterySection"),
      description: "",
      entries: [
        {
          title: t("docs.batteryCapacity"),
          lead: t("docs.batteryCapacityLead"),
          formula: String.raw`\displaystyle
 C_{batt} = \frac{E_{dag} \cdot n_{autonomi}}{U \cdot DoD}`,
          items: [
            { symbol: "C_{batt}", unit: "\\mathrm{Ah}", description: t("docs.batteryCapacitySymbol") },
            { symbol: "E_{dag}", unit: "\\mathrm{Wh}", description: t("docs.dailyConsumptionSymbol") },
            { symbol: "n_{autonomi}", unit: "\\text{dagar}", description: t("docs.autonomyDays") },
            { symbol: "U", unit: "\\mathrm{V}", description: t("docs.nominalVoltage") },
            { symbol: "DoD", description: t("docs.dodSymbol") }
          ]
        }
      ]
    },
    {
      title: t("docs.radioLinkSection"),
      description: "",
      entries: [
        {
          title: t("docs.terrainDistance"),
          lead: t("docs.terrainDistanceLead"),
          formula: String.raw`\displaystyle
d_g = 2R_E \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_A)\cos(\phi_B)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)`,
          items: [
            { symbol: "d_g", unit: "\\mathrm{m}", description: t("docs.terrainDistanceSymbol") },
            { symbol: "R_E", unit: "\\mathrm{m}", description: t("docs.earthRadius") },
            { symbol: "\\phi_A, \\phi_B", description: t("docs.latAB") },
            { symbol: "\\Delta \\phi", description: t("docs.deltaLat") },
            { symbol: "\\Delta \\lambda", description: t("docs.deltaLng") }
          ]
        },
        {
          title: "Fresnel-radius",
          lead: t("docs.fresnelAndFreeSpaceLead"),
          formula: String.raw`\displaystyle
F_1 = \sqrt{\frac{\lambda d_1 d_2}{d_1 + d_2}} \cdot k_F`,
          items: [
            { symbol: "F_1", unit: "\\mathrm{m}", description: t("docs.fresnelRadius") },
            { symbol: "\\lambda", unit: "\\mathrm{m}", description: t("docs.wavelength") },
            { symbol: "d_1, d_2", unit: "\\mathrm{m}", description: t("docs.obstructionDistance") },
            { symbol: "k_F", description: t("docs.fresnelFactor") }
          ]
        },
        {
          title: "Friromsdemping",
          lead: "",
          formula: String.raw`\displaystyle
L_{fs} = 20 \log_{10}\left(\frac{4 \pi d_g}{\lambda}\right)`,
          items: [
            { symbol: "L_{fs}", unit: "\\mathrm{dB}", description: t("docs.freeSpaceLoss") }
          ]
        },
        {
          title: "Effektiv jordradius",
          lead: t("docs.earthCurvatureLead"),
          formula: String.raw`\displaystyle
R_{eff} = k \cdot R_E`,
          items: [
            { symbol: "R_{eff}", unit: "\\mathrm{m}", description: t("docs.effectiveEarthRadius") },
            { symbol: "k", description: t("docs.kFactorChosen") }
          ]
        },
        {
          title: "Siktlinjeklaring",
          lead: "",
          formula: String.raw`\displaystyle
K_{LOS} = \min_x \left(h_{LOS}(x) - \left(h_{terr}(x) + h_E(x)\right)\right)`,
          items: [
            { symbol: "K_{LOS}", unit: "\\mathrm{m}", description: t("docs.losClearance") },
            { symbol: "h_E(x)", unit: "\\mathrm{m}", description: t("docs.earthCurveCorrection") }
          ]
        },
        {
          title: "Fresnel-klaring",
          lead: "",
          formula: String.raw`\displaystyle
K_F = \min_x \left(h_{LOS}(x) - F_1(x) - \left(h_{terr}(x) + h_E(x)\right)\right)`,
          items: [
            { symbol: "K_F", unit: "\\mathrm{m}", description: t("docs.fresnelClearance") },
            { symbol: "h_E(x)", unit: "\\mathrm{m}", description: t("docs.earthCurveCorrection") }
          ]
        },
        {
          title: t("docs.rainAttenuation"),
          lead: t("docs.rainAttenuationLead"),
          formula: String.raw`\displaystyle
A_r = \gamma_R \cdot r \cdot d`,
          items: [
            { symbol: "A_r", unit: "\\mathrm{dB}", description: t("docs.totalRainAtt") },
            { symbol: "\\gamma_R", unit: "\\mathrm{dB}/\\mathrm{km}", description: t("docs.specificRainAtt") },
            { symbol: "r", description: t("docs.reductionFactor") },
            { symbol: "d", unit: "\\mathrm{km}", description: t("docs.linkLength") }
          ]
        },
        {
          title: "Spesifikk regndemping",
          lead: "",
          formula: String.raw`\displaystyle
\gamma_R = k_R \cdot R^\alpha`,
          items: [
            { symbol: "\\gamma_R", unit: "\\mathrm{dB}/\\mathrm{km}", description: t("docs.specificRainAtt") },
            { symbol: "R", unit: "\\mathrm{mm}/\\mathrm{h}", description: t("docs.rainRate") },
            { symbol: "k_R, \\alpha", description: t("docs.rainCoefficients") }
          ]
        }
      ]
    }
  ];
}

function ensureMathJaxLoaded(): Promise<void> {
  const mathWindow = window as MathJaxWindow;

  if (mathWindow.MathJax?.typesetPromise) {
    return mathWindow.MathJax.startup?.promise?.then(() => undefined) ?? Promise.resolve();
  }

  if (mathJaxLoader) {
    return mathJaxLoader;
  }

  mathWindow.MathJax = {
    tex: {
      inlineMath: [
        ["\\(", "\\)"],
        ["$", "$"]
      ],
      displayMath: [
        ["\\[", "\\]"],
        ["$$", "$$"]
      ]
    },
    svg: {
      fontCache: "global"
    },
    options: {
      skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
    },
    startup: {
      typeset: false
    }
  };

  mathJaxLoader = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("hydroguide-mathjax") as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    const handleLoad = () => {
      const ready = (window as MathJaxWindow).MathJax?.startup?.promise;
      if (ready) {
        ready.then(() => resolve()).catch(reject);
        return;
      }

      resolve();
    };

    const handleError = () => {
      mathJaxLoader = null;
      reject(new Error("MathJax could not be loaded."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = "hydroguide-mathjax";
      script.src = "https://files.hydroguide.no/vendor/mathjax/tex-svg.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return mathJaxLoader;
}

function InlineMath({ tex }: { tex: string }) {
  return <span className={`${workspaceContentValueBaseClassName} text-[var(--hg-ink)]`}>{`\\(${tex}\\)`}</span>;
}

function FormulaBlock({ tex }: { tex: string }) {
  return (
    <div className="hg-formula-block my-4 max-w-full overflow-x-auto overflow-y-hidden px-0 py-3 text-left text-[1.08rem] text-[var(--hg-ink)]">
      {`\\[${tex}\\]`}
    </div>
  );
}

function DefinitionList({
  items,
  heading,
  descriptionHeading
}: {
  items: FormulaItem[];
  heading: string;
  descriptionHeading: string;
}) {
  return (
    <div className="mt-4">
      <div className="max-w-full overflow-x-auto">
      <table className="hg-definition-table min-w-[36rem] w-full table-fixed text-left">
        <colgroup>
          <col className="w-[31%] sm:w-[28%]" />
          <col className="w-[22%]" />
          <col />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--hg-hairline)]">
            <th className={`py-2 pr-3 text-left ${workspaceSubsectionTitleClassName}`}>{heading}</th>
            <th className={`px-3 py-2 text-left ${workspaceSubsectionTitleClassName}`}>Enhet</th>
            <th className={`px-3 py-2 text-left ${workspaceSubsectionTitleClassName}`}>{descriptionHeading}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.symbol} className="border-t border-[var(--hg-hairline-2)] first:border-t-0">
              <td className={`whitespace-nowrap py-2 pr-3 align-top ${workspaceContentValueBaseClassName} text-[var(--hg-ink)]`}>
                <InlineMath tex={item.symbol} />
              </td>
              <td className={`whitespace-nowrap px-3 py-2 align-top ${workspaceContentValueBaseClassName} text-[var(--hg-muted)]`}>
                {item.unit ? <InlineMath tex={item.unit} /> : "-"}
              </td>
              <td className={`px-3 py-2 align-top ${workspaceBodyClassName}`}>
                {item.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default function DocumentationPage() {
  const { t, language } = useLanguage();
  const sections = useMemo(() => buildSections(t), [language, t]);
  const mathDocumentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    ensureMathJaxLoaded()
      .then(async () => {
        if (cancelled || !mathDocumentRef.current) {
          return;
        }

        const mathJax = (window as MathJaxWindow).MathJax;
        if (!mathJax?.typesetPromise) {
          return;
        }

        mathJax.typesetClear?.([mathDocumentRef.current]);
        await mathJax.typesetPromise([mathDocumentRef.current]);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [sections]);

  return (
    <main className={workspacePageClassName}>
      <WorkspaceHeader title={t("docs.title")} />

      <div ref={mathDocumentRef} className="min-w-0 space-y-4">
        {sections.map((section, index) => (
          <div id={`doc-${index}`} key={section.title} className="scroll-mt-4">
            <EditorialSection title={section.title} description={section.description || undefined}>
            <div className="space-y-8">
              {section.entries.map((entry, index) => (
                <article
                  key={`${section.title}-${entry.title || index}`}
                  className="border-t border-[var(--hg-hairline-2)] pt-6 first:border-t-0 first:pt-0"
                >
                  {entry.title ? <h3 className={workspaceSubsectionTitleClassName}>{entry.title}</h3> : null}
                  {entry.formula ? <FormulaBlock tex={entry.formula} /> : null}
                  {entry.items && entry.items.length > 0 ? (
                    <DefinitionList
                      items={entry.items}
                      heading="Symbol"
                      descriptionHeading="Forklaring"
                    />
                  ) : null}
                </article>
              ))}
            </div>
          </EditorialSection>
          </div>
        ))}
      </div>
    </main>
  );
}
