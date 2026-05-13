import type { UniversalNveObligation } from "./sourceAnchoredModel";

function obligation(input: UniversalNveObligation): UniversalNveObligation {
  return input;
}

export const universalNveObligations: UniversalNveObligation[] = [
  obligation({
    id: "nve_hourly_registration",
    title: "Automatisk registrering minst en gang per time",
    sourceRefs: ["NVE_2024_MVF_4_1"],
    sourceInterpretation: "NVE 2024 sets minimum hourly registration as an instrumentation and operation requirement.",
    obligationText: "Valgt metode forutsetter automatisk registrering minst en gang per time.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  }),
  obligation({
    id: "nve_accuracy_within_5_percent",
    title: "Noyaktighet innen +/-5 prosent ved kravsatt slipp",
    sourceRefs: ["NVE_2024_MVF_4_1"],
    sourceInterpretation: "NVE 2024 sets accuracy within +/-5 percent at the required minimum-flow release as a system requirement.",
    obligationText: "Valgt metode forutsetter noyaktighet innen +/-5 prosent ved kravsatt slipp.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  }),
  obligation({
    id: "nve_97_percent_correct_complete",
    title: "Minst 97 prosent korrekte og komplette registreringer",
    sourceRefs: ["NVE_2024_MVF_4_1", "NVE_2024_ELV_4_7"],
    sourceInterpretation: "NVE 2024 requires correct and complete registrations for at least 97 percent of the relevant period.",
    obligationText: "Valgt metode forutsetter minst 97 prosent korrekte og komplette registreringer i relevant periode.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  }),
  obligation({
    id: "nve_continuous_operation_data_access_backup",
    title: "Kontinuerlig drift, datatilgang og relevant backup",
    sourceRefs: ["NVE_2024_MVF_4_1", "NVE_2024_ELV_4_2_1"],
    sourceInterpretation: "NVE 2024 treats continuous operation, data access, and backup where relevant as measurement-system obligations.",
    obligationText: "Valgt metode forutsetter kontinuerlig drift, datatilgang og relevant backup der forholdene tilsier det.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  }),
  obligation({
    id: "nve_periodic_controls",
    title: "Kontrollrutiner og periodiske kontroller",
    sourceRefs: ["NVE_2024_MVF_4_5", "NVE_2024_ELV_4_6"],
    sourceInterpretation: "NVE 2024 requires periodic controls, annual main controls, and relevant control measurements in operation.",
    obligationText: "Valgt metode forutsetter kontrollrutiner og periodiske kontroller i driftsfasen.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  }),
  obligation({
    id: "nve_storage_presentation_to_nve",
    title: "Sikker lagring, dokumentasjon og fremlegging for NVE",
    sourceRefs: ["NVE_2020_1_4_2", "NVE_2020_2_6", "NVE_2020_6_1"],
    sourceInterpretation: "NVE guidance treats documentation, storage, signal transfer, and presentation to NVE as responsibility and report obligations.",
    obligationText: "Valgt metode forutsetter at dokumentasjon og maledata lagres og kan legges fram for NVE.",
    appliesTo: "all_methods",
    visibleToUserAsQuestion: false,
    mayAppearInReport: true,
    mayAppearInAiNarrative: true,
    mayBlockUserValidation: false,
    mayCreateMissingDataStatus: false
  })
];

export const universalNveObligationIds = universalNveObligations.map((item) => item.id);
