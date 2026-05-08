import { useEffect, useRef } from "react";
import WorkspaceHeader from "../components/WorkspaceHeader";
import { useMemo } from "react";
import WorkspaceSection from "../components/WorkspaceSection";
import { useLanguage } from "../i18n";
import type { TranslationKey } from "../i18n";
import {
  workspaceBodyClassName,
  workspaceBodyMutedClassName,
  workspaceContentValueBaseClassName,
  workspaceContentValueClassName,
  workspaceMetaClassName,
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
          title: t("docs.powerCurrentDaily"),
          lead: t("docs.powerCurrentDailyLead"),
          formula: String.raw`\displaystyle
I = \frac{P}{V_{nom}}, \qquad E_{dag} = P \cdot t, \qquad Q_{dag} = I \cdot t`,
          items: [
            { symbol: "I", unit: "A", description: t("docs.current") },
            { symbol: "P", unit: "W", description: t("docs.power") },
            { symbol: "V_{nom}", unit: "V", description: t("docs.nominalVoltage") },
            { symbol: "E_{dag}", unit: "Wh", description: t("docs.dailyConsumption") },
            { symbol: "Q_{dag}", unit: "Ah", description: t("docs.dailyCurrent") },
            { symbol: "t", unit: "h", description: t("docs.hoursPerDay") }
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
E_{sol} = G \cdot P_{panel} \cdot n_{panel} \cdot \eta_{system}`,
          items: [
            { symbol: "E_{sol}", unit: "Wh", description: t("docs.solarProductionSymbol") },
            { symbol: "G", unit: "kWh/m^2", description: t("docs.solarRadiation") },
            { symbol: "P_{panel}", unit: "W", description: t("docs.panelPower") },
            { symbol: "n_{panel}", unit: "stk", description: t("docs.panelCount") },
            { symbol: "\\eta_{system}", description: t("docs.systemEfficiency") }
          ]
        },
        {
          title: t("docs.consumptionAndDeficit"),
          lead: t("docs.consumptionAndDeficitLead"),
          formula: String.raw`\displaystyle
E_{forbruk} = E_{dag} \cdot n_{dager}, \qquad E_{underskudd} = E_{forbruk} - E_{sol}`,
          items: [
            { symbol: "E_{forbruk}", unit: "Wh", description: t("docs.totalConsumption") },
            { symbol: "E_{dag}", unit: "Wh", description: t("docs.dailyConsumptionSymbol") },
            { symbol: "n_{dager}", unit: "dagar", description: t("docs.numberOfDays") },
            { symbol: "E_{underskudd}", unit: "Wh", description: t("docs.energyDeficit") },
            { symbol: "E_{sol}", unit: "Wh", description: t("docs.solarProductionSymbol") }
          ]
        },
        {
          title: t("docs.energyBalanceTitle"),
          lead: t("docs.energyBalanceLead"),
          formula: String.raw`\displaystyle
E_{bal} = E_{sol} - E_{forbruk}`,
          items: [
            { symbol: "E_{bal}", unit: "Wh", description: t("docs.energyBalanceSymbol") },
            { symbol: "E_{sol}", unit: "Wh", description: t("docs.solarProductionSymbol") },
            { symbol: "E_{forbruk}", unit: "Wh", description: t("docs.totalConsumption") }
          ]
        },
        {
          title: t("docs.runtimeHours"),
          lead: t("docs.runtimeHoursLead"),
          formula: String.raw`\displaystyle
t_{drift} = \frac{E_{underskudd}}{P_{sek}}, \qquad t_{tot} = \sum t_{drift}`,
          items: [
            { symbol: "t_{drift}", unit: "h", description: t("docs.runtimeHoursSymbol") },
            { symbol: "t_{tot}", unit: "h", description: t("docs.totalRuntimeHours") },
            { symbol: "E_{underskudd}", unit: "Wh", description: t("docs.energyDeficitSymbol") },
            { symbol: "P_{sek}", unit: "W", description: t("docs.secondaryPower") }
          ]
        },
        {
          title: t("docs.fuelConsumption"),
          lead: t("docs.fuelConsumptionLead"),
          formula: String.raw`\displaystyle
F = E_{underskudd} \cdot r_{forbruk}\ \text{eller} \Rightarrow\ F = t_{drift} \cdot P_{sek} \cdot r_{forbruk}, \qquad C_{drivstoff} = F \cdot p_{drivstoff}`,
          items: [
            { symbol: "F", unit: "L", description: t("docs.fuelSymbol") },
            { symbol: "E_{underskudd}", unit: "Wh", description: t("docs.energyDeficitSymbol") },
            { symbol: "t_{drift}", unit: "h", description: t("docs.runtimeHoursSymbol") },
            { symbol: "P_{sek}", unit: "W", description: t("docs.secondaryPower") },
            { symbol: "r_{forbruk}", unit: "L/kWh", description: t("docs.consumptionRate") },
            { symbol: "C_{drivstoff}", unit: "kr", description: t("docs.fuelCost") },
            { symbol: "p_{drivstoff}", unit: "kr/L", description: t("docs.fuelPriceSymbol") }
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
 C_{batt} = \frac{E_{dag} \cdot n_{autonomi}}{V_{nom} \cdot DoD}`,
          items: [
            { symbol: "C_{batt}", unit: "Ah", description: t("docs.batteryCapacitySymbol") },
            { symbol: "E_{dag}", unit: "Wh", description: t("docs.dailyConsumptionSymbol") },
            { symbol: "n_{autonomi}", unit: "dagar", description: t("docs.autonomyDays") },
            { symbol: "V_{nom}", unit: "V", description: t("docs.nominalVoltage") },
            { symbol: "DoD", description: t("docs.dodSymbol") }
          ]
        }
      ]
    },
    {
      title: t("docs.tocSection"),
      description: "",
      entries: [
        {
          title: "TOC",
          lead: t("docs.tocLead"),
          formula: String.raw`\displaystyle
TOC = C_{innkjøp} + H \cdot \left(C_{drivstoff} + C_{vedlikehold}\right)`,
          items: [
            { symbol: "TOC", unit: "kr", description: t("docs.tocSymbol") },
            { symbol: "C_{innkjøp}", unit: "kr", description: t("docs.purchaseCost") },
            { symbol: "H", unit: "år", description: t("docs.horizonYears") },
            { symbol: "C_{drivstoff}", unit: "kr/år", description: t("docs.fuelCostPerYear") },
            { symbol: "C_{vedlikehold}", unit: "kr/år", description: t("docs.maintenanceCostPerYear") }
          ]
        }
      ]
    },
    {
      title: t("docs.radioLinkSection"),
      description: t("docs.radioLinkDesc"),
      entries: [
        {
          title: t("docs.terrainDistance"),
          lead: t("docs.terrainDistanceLead"),
          formula: String.raw`\displaystyle
d_g = 2R_E \cdot \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_A)\cos(\phi_B)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)`,
          items: [
            { symbol: "d_g", unit: "m", description: t("docs.terrainDistanceSymbol") },
            { symbol: "R_E", unit: "m", description: t("docs.earthRadius") },
            { symbol: "\\phi_A, \\phi_B", description: t("docs.latAB") },
            { symbol: "\\Delta \\phi", description: t("docs.deltaLat") },
            { symbol: "\\Delta \\lambda", description: t("docs.deltaLng") }
          ]
        },
        {
          title: t("docs.fresnelAndFreeSpace"),
          lead: t("docs.fresnelAndFreeSpaceLead"),
          formula: String.raw`\displaystyle
F_1 = \sqrt{\frac{\lambda d_1 d_2}{d_1 + d_2}} \cdot k_F, \qquad L_{fs} = 20 \log_{10}\left(\frac{4 \pi d_g}{\lambda}\right)`,
          items: [
            { symbol: "F_1", unit: "m", description: t("docs.fresnelRadius") },
            { symbol: "\\lambda", unit: "m", description: t("docs.wavelength") },
            { symbol: "d_1, d_2", unit: "m", description: t("docs.obstructionDistance") },
            { symbol: "k_F", description: t("docs.fresnelFactor") },
            { symbol: "L_{fs}", unit: "dB", description: t("docs.freeSpaceLoss") }
          ]
        },
        {
          title: t("docs.earthCurvature"),
          lead: t("docs.earthCurvatureLead"),
          formula: String.raw`\displaystyle
R_{eff} = k \cdot R_E, \qquad K_{LOS} = \min_x \left(h_{LOS}(x) - \left(h_{terr}(x) + h_E(x)\right)\right), \qquad K_F = \min_x \left(h_{LOS}(x) - F_1(x) - \left(h_{terr}(x) + h_E(x)\right)\right)`,
          items: [
            { symbol: "R_{eff}", unit: "m", description: t("docs.effectiveEarthRadius") },
            { symbol: "k", description: t("docs.kFactorChosen") },
            { symbol: "K_{LOS}", unit: "m", description: t("docs.losClearance") },
            { symbol: "K_F", unit: "m", description: t("docs.fresnelClearance") },
            { symbol: "h_E(x)", unit: "m", description: t("docs.earthCurveCorrection") }
          ]
        },
        {
          title: t("docs.rainAttenuation"),
          lead: t("docs.rainAttenuationLead"),
          formula: String.raw`\displaystyle
A_r = \gamma_R \cdot r \cdot d, \qquad \gamma_R = k_R \cdot R^\alpha`,
          items: [
            { symbol: "A_r", unit: "dB", description: t("docs.totalRainAtt") },
            { symbol: "\\gamma_R", unit: "dB/km", description: t("docs.specificRainAtt") },
            { symbol: "r", description: t("docs.reductionFactor") },
            { symbol: "d", unit: "km", description: t("docs.linkLength") },
            { symbol: "R", unit: "mm/h", description: t("docs.rainRate") },
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
    <div className="my-4 max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-[var(--hg-hairline)] bg-[var(--hg-bg)] px-4 py-3 text-left text-[length:var(--hg-type-category-size)] text-[var(--hg-ink)]">
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
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[var(--hg-hairline-2)]">
            <th className={`py-2 pr-4 text-left align-middle ${workspaceSubsectionTitleClassName}`}>
              {heading}
            </th>
            <th className={`w-24 py-2 text-center align-middle ${workspaceSubsectionTitleClassName}`}>Enhet</th>
            <th className={`py-2 pl-4 text-left align-middle ${workspaceSubsectionTitleClassName}`}>{descriptionHeading}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.symbol} className="border-t border-[var(--hg-hairline-2)] first:border-t-0">
              <td className={`w-28 whitespace-nowrap py-2 pr-4 align-top sm:w-36 ${workspaceContentValueBaseClassName} text-[var(--hg-ink)]`}>
                <InlineMath tex={item.symbol} />
              </td>
              <td className={`w-24 py-2 text-center align-top ${workspaceBodyClassName}`}>{item.unit ?? ""}</td>
              <td className={`py-2 align-top ${workspaceBodyClassName}`}>
                {item.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <section className="hg-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <p className={`${workspaceMetaClassName} shrink-0`}>På denne siden</p>
          <div className="flex flex-wrap gap-3">
            {sections.map((section, index) => (
              <a
                key={section.title}
                href={`#doc-${index}`}
                className="inline-flex items-baseline gap-2 text-[length:var(--hg-type-content-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink-2)] transition hover:text-[var(--hg-accent)]"
              >
                <span className="hg-mono text-[10px] text-[var(--hg-muted)]">{index + 1}</span>
                {section.title}
              </a>
            ))}
          </div>
        </section>

        {sections.map((section, index) => (
          <div id={`doc-${index}`} key={section.title} className="scroll-mt-4">
            <WorkspaceSection title={section.title} description={section.description || undefined}>
            <div className="space-y-8">
              {section.entries.map((entry, index) => (
                <article
                  key={`${section.title}-${entry.title || index}`}
                  className="border-t border-[var(--hg-hairline-2)] pt-6 first:border-t-0 first:pt-0"
                >
                  {entry.title ? <h3 className={workspaceSubsectionTitleClassName}>{entry.title}</h3> : null}
                  {entry.lead ? <p className={`mt-1 ${workspaceBodyMutedClassName}`}>{entry.lead}</p> : null}
                  {entry.formula ? <FormulaBlock tex={entry.formula} /> : null}
                  {entry.items && entry.items.length > 0 ? (
                    <DefinitionList
                      items={entry.items}
                      heading="Forklaringer"
                      descriptionHeading="Forklaring"
                    />
                  ) : null}
                </article>
              ))}
            </div>
          </WorkspaceSection>
          </div>
        ))}
        <section className="rounded-lg border border-[var(--hg-hairline-2)] bg-[var(--hg-surface-2)] p-4">
          <p className={workspaceContentValueClassName}>HydroGuide er et støtteverktøy.</p>
          <p className={`mt-1 ${workspaceBodyClassName}`}>
            Formelgrunnlaget skal kontrolleres mot prosjektkrav og faglig vurdering før endelig bruk.
          </p>
        </section>
      </div>
    </main>
  );
}
