import { nveSourceRegister, sourceRef } from "./nveSources";
import { universalNveObligationIds, universalNveObligations } from "./universalNveObligations";
import {
  EVIDENCE_OPTIONS,
  EvidenceStatus,
  HydroGuideAnswerValue,
  HydroGuideAnswerOption,
  HydroGuideAnswers,
  HydroGuideCard,
  HydroGuideCriterion,
  HydroGuideDecision,
  HydroGuideDecisionStatus,
  HydroGuideMethodCandidate,
  SourceAnchoredReportSummary,
  UnanchoredCandidate
} from "./sourceAnchoredModel";

const PASS: EvidenceStatus = "documented_satisfies_source_criterion";
const FAIL: EvidenceStatus = "documented_does_not_satisfy_source_criterion";
const MISSING: EvidenceStatus = "not_documented_yet";

function evidenceOptions(sourceRefs: string[]): HydroGuideAnswerOption[] {
  return EVIDENCE_OPTIONS.map((option) => ({
    ...option,
    sourceRefs,
    semanticMeaning: `${option.semanticMeaning} The criterion is anchored to ${sourceRefs.join(", ")}.`
  }));
}

function option(id: string, label: string, sourceRefs: string[], semanticMeaning: string): HydroGuideAnswerOption {
  return { id, label, sourceRefs, semanticMeaning, isAppOperationalization: false };
}

function criterion(input: HydroGuideCriterion): HydroGuideCriterion {
  const options =
    input.answerModel === "evidence_status"
      ? evidenceOptions(input.sourceRefs)
      : input.options;
  return { ...input, options };
}

export const secureDataStorageReportRequirement = {
  text: "Dokumentasjon og måledata skal lagres slik at ansvarlig tiltakshaver kan legge dem fram for NVE.",
  sourceRefs: ["NVE_2020_1_4_2", "NVE_2020_2_6", "NVE_2020_6_1"]
};

export const unanchoredCandidates: UnanchoredCandidate[] = [
  {
    id: "camera_only_documentation",
    label: "Kamera eller manuell observasjon alene",
    reason: "Kept out of production recommendations because the provided NVE source set supports it only as supplementary control context, not as a standalone accepted measurement method."
  },
  {
    id: "radar_index_flow_model",
    label: "Radar-/modellbasert alternativ metode",
    reason: "Handled only through alternative-method/NVE-clarification status because the provided source register does not anchor it as a normal accepted minimum-flow documentation method."
  }
];

export const hydroGuideCriteria: HydroGuideCriterion[] = [
  criterion({
    id: "legal_requirement_documented",
    title: "Konsesjons-/vedtaksgrunnlag for minstevannføring er dokumentert",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_1_3", "NVE_2020_2_6"],
    sourceInterpretation: "NVE describes the concession or decision as the source of the actual minimum-flow requirement; HydroGuide records whether that external requirement is documented.",
    sourceScope: "requirement",
    answerModel: "evidence_status",
    requiredFor: ["all"]
  }),
  criterion({
    id: "minimum_flow_requirement_lps",
    title: "Oppgitt minstevannføringskrav",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_2_6"],
    sourceInterpretation: "The app captures the documented requirement value but does not calculate or invent the legal requirement.",
    sourceScope: "requirement",
    answerModel: "numeric",
    requiredFor: ["all"]
  }),
  criterion({
    id: "requirement_pattern",
    title: "Kravmønster fra konsesjon/vedtak",
    branch: "project_requirement",
    sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_3_1", "NVE_2020_2_6"],
    sourceInterpretation: "NVE source sections make seasonal, conditional, and site-specific requirements relevant to arrangement choice and detail-plan documentation.",
    sourceScope: "requirement",
    answerModel: "source_anchored_category",
    options: [
      option("single_fixed_requirement", "Én fast verdi", ["NVE_2020_1_4_1", "NVE_2020_2_6"], "The documented requirement is one fixed release value."),
      option("seasonal_or_conditional_requirement", "Sesong/conditional", ["NVE_2020_1_4_1", "NVE_2020_3_1"], "The documented requirement varies by season or operating condition."),
      option("not_documented_yet", "Ikke dokumentert ennå", ["NVE_2020_1_4_1"], "The requirement pattern has not yet been found in the concession or decision.")
    ],
    requiredFor: ["all"]
  }),
  criterion({
    id: "release_solution_category",
    title: "Fysisk slippløsning",
    branch: "release_solution",
    sourceRefs: ["NVE_2020_4_1", "NVE_2020_9"],
    sourceInterpretation: "NVE describes accepted release arrangement families; every selectable category is anchored to its specific source section.",
    sourceScope: "accepted_method",
    answerModel: "source_anchored_category",
    options: [
      option("pipe_via_intake", "Rør via inntak", ["NVE_2020_4_2", "NVE_2020_9"], "Minimum flow is released through pipe via the intake arrangement."),
      option("pipe_through_dam", "Rør gjennom dam", ["NVE_2020_4_3", "NVE_2020_9"], "Minimum flow is released through pipe through dam or threshold."),
      option("gate", "Luke", ["NVE_2020_4_4", "NVE_2020_9"], "Minimum flow is released through a gate/luke arrangement."),
      option("opening_in_dam", "Utsparing i dam", ["NVE_2020_4_5", "NVE_2020_9"], "Minimum flow is released through opening/notch in dam or overflow threshold."),
      option("fish_passage", "Fiskepassasje", ["NVE_2020_5_1", "NVE_2020_9"], "Minimum flow is fully or partly released through a fish passage."),
      option("coanda_tyrolean_screen", "Coanda-/tyrolerrist", ["NVE_2020_5_2"], "The release arrangement is tied to a coanda or tyrolean screen intake."),
      option("other_alternative", "Annen/alternativ metode", ["NVE_2020_6_1", "NVE_2024_MVF_4"], "The arrangement is outside the normal accepted set and needs special justification or NVE clarification.")
    ],
    requiredFor: ["all"]
  }),
  criterion({
    id: "site_constraints",
    title: "Kildeforankrede sted- og driftsforhold",
    branch: "operation_and_control",
    sourceRefs: ["NVE_2020_3_1", "NVE_2020_2_6", "NVE_2020_8", "NVE_2024_ELV_4_6"],
    sourceInterpretation: "Hydrology, climate, physical conditions, debris, ice, accessibility, power, communication, and follow-up affect arrangement choice.",
    sourceScope: "context",
    answerModel: "multi_select_source_anchored",
    options: [
      option("hydrology_or_seasonal_variation", "Hydrologi/sesongvariasjon", ["NVE_2020_3_1"], "Hydrological or seasonal flow pattern affects arrangement choice."),
      option("debris_or_sediment", "Drivgods/sediment", ["NVE_2020_2_6", "NVE_2024_ELV_4_6"], "Debris or sediment can affect release and station operation."),
      option("winter_ice_or_frost", "Is/frost", ["NVE_2020_3_1", "NVE_2020_8", "NVE_2024_ELV_4_6"], "Winter climate, ice, or frost can affect release and measurement."),
      option("difficult_access", "Vanskelig adkomst", ["NVE_2020_3_1", "NVE_2020_8"], "Access affects operation, follow-up, and control routines."),
      option("power_or_communication_constraint", "Strøm/kommunikasjon", ["NVE_2020_6_1", "NVE_2024_ELV_4_6"], "Power and communication constraints affect measurement station operation."),
      option("none_documented", "Ingen særskilt dokumentert", ["NVE_2020_3_1"], "No source-backed site constraint is currently documented.")
    ]
  }),
  criterion({ id: "pipe_after_rack", title: "Vann tas ut etter inntaksrist/varegrind der det er relevant", branch: "pipe_measurement", sourceRefs: ["NVE_2020_4_2", "NVE_2020_9"], sourceInterpretation: "Pipe via intake criteria include intake arrangement after rack/screen where relevant.", sourceScope: "accepted_method", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "pipe_dry_frost_free", title: "Måler/elektronikk plasseres tørt og frostfritt eller beskyttet", branch: "pipe_measurement", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2"], sourceInterpretation: "NVE's pipe sections support protected dry/frost-free placement where the pipe arrangement uses measuring equipment.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "pipe_full_through_meter", title: "Rør er vannfylt gjennom måleren", branch: "pipe_measurement", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2", "NVE_2024_MVF_4_2"], sourceInterpretation: "Pipe-flow measurement depends on a filled pipe through the meter.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "pipe_air_handled", title: "Luftinnblanding og luftfølsomhet er håndtert", branch: "pipe_measurement", sourceRefs: ["NVE_2020_6_2", "NVE_2020_5_2"], sourceInterpretation: "Pipe meters are sensitive to air, and coanda collection can introduce air entrainment.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "pipe_straight_run_supplier_requirements", title: "Rettstrekk, rolig strømning og leverandørkrav er dokumentert", branch: "pipe_measurement", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2"], sourceInterpretation: "NVE's pipe-flow guidance requires correct installation, straight run, and suitable flow conditions where meter requirements demand it.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "pipe_calibration_control", title: "Kalibrering og kontrollmåling for rørmåling er dokumentert", branch: "pipe_measurement", sourceRefs: ["NVE_2024_MVF_4_2", "NVE_2024_MVF_4_5"], sourceInterpretation: "2024 minimum-flow guideline requires calibration at establishment and repeated control measurements.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_via_intake_with_pipe_flow_meter"] }),
  criterion({ id: "water_level_rating_curve", title: "Vannstandsmåling med vannføringskurve er dokumentert", branch: "water_level_measurement", sourceRefs: ["NVE_2020_6_3", "NVE_2024_MVF_4_3", "NVE_2024_ELV_4_5"], sourceInterpretation: "Water-level based documentation requires a rating curve and curve handling under NVE's river-flow guideline.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "water_level_electronic_registration", title: "Elektronisk vannstandsregistrering er dokumentert", branch: "water_level_measurement", sourceRefs: ["NVE_2020_6_3", "NVE_2024_ELV_4_2_1"], sourceInterpretation: "NVE's water-level method requires electronic/automatic station instrumentation.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "water_level_unambiguous_relationship", title: "Entydig sammenheng mellom vannstand og vannføring er dokumentert", branch: "water_level_measurement", sourceRefs: ["NVE_2020_6_3", "NVE_2024_MVF_4_3"], sourceInterpretation: "Water-level calculation requires an unambiguous stage-discharge relationship.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "natural_profile_stable_control", title: "Naturlig profil har stabilt bestemmende profil", branch: "natural_profile", sourceRefs: ["NVE_2020_6_3_3", "NVE_2024_MVF_4_3_1", "NVE_2024_ELV_4_5"], sourceInterpretation: "Natural profile criteria require a stable controlling profile and unambiguous relationship.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "natural_profile_sufficient_measurements", title: "Tilstrekkelige målinger og kurvekvalitet rundt minstevannføring", branch: "natural_profile", sourceRefs: ["NVE_2024_MVF_4_3_1", "NVE_2024_ELV_4_5"], sourceInterpretation: "2024 sources require enough measurements and quality around the minimum-flow range.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "natural_profile_changes_handled", title: "Endringer fra is, flom, sediment eller profilendring er håndtert", branch: "natural_profile", sourceRefs: ["NVE_2020_6_3_3", "NVE_2024_MVF_4_3_1", "NVE_2024_ELV_4_6"], sourceInterpretation: "NVE describes profile changes and ice/flood/sediment effects as conditions that must be controlled and followed up.", sourceScope: "warning", answerModel: "evidence_status" }),
  criterion({ id: "artificial_profile_suitable_when_natural_unsuitable", title: "Kunstig profil er valgt som egnet alternativ", branch: "artificial_profile", sourceRefs: ["NVE_2020_6_3_4", "NVE_2024_MVF_4_3_2"], sourceInterpretation: "Artificial profiles are anchored as alternatives when natural profiles are unsuitable or small flows need stable measurement.", sourceScope: "accepted_method", answerModel: "evidence_status" }),
  criterion({ id: "artificial_profile_standard_construction", title: "Kunstig profil bygges etter standard og korrekt geometri", branch: "artificial_profile", sourceRefs: ["NVE_2020_6_3_4", "NVE_2024_MVF_4_3_2"], sourceInterpretation: "Artificial-profile accuracy depends on correct construction and known geometry.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "artificial_profile_control_measurements", title: "Kontrollmålinger og skade-/endringsrutiner er dokumentert", branch: "artificial_profile", sourceRefs: ["NVE_2020_6_3_4", "NVE_2024_MVF_4_3_2", "NVE_2024_ELV_4_5"], sourceInterpretation: "NVE requires control measurements and new controls after damage or changes.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "artificial_profile_five_percent_verification", title: "Kunstig profil er verifisert med kontrollmålinger rundt kravsatt slipp", branch: "artificial_profile", sourceRefs: ["NVE_2024_MVF_4_3_2", "NVE_2024_MVF_4_1"], sourceInterpretation: "The 2024 guideline requires artificial-profile curve verification with measurements around the required release; HydroGuide treats the general accuracy threshold as an implicit NVE obligation.", sourceScope: "documentation_requirement", answerModel: "evidence_status" }),
  criterion({ id: "dam_pipe_below_lrv", title: "Rør gjennom dam ligger under LRV/laveste driftsvannstand", branch: "dam_pipe", sourceRefs: ["NVE_2020_4_3", "NVE_2020_9"], sourceInterpretation: "Dam-pipe source criteria include placement below lowest regulated/operating water level.", sourceScope: "accepted_method", answerModel: "evidence_status", requiredFor: ["pipe_through_dam_with_downstream_profile"] }),
  criterion({ id: "dam_pipe_capacity_margin_no_vortex", title: "Kapasitetsmargin og lav risiko for virvler/luftinnsug er dokumentert", branch: "dam_pipe", sourceRefs: ["NVE_2020_4_3"], sourceInterpretation: "NVE describes capacity margin and avoidance of vortices/air intake for pipe through dam.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_through_dam_with_downstream_profile"] }),
  criterion({ id: "dam_pipe_sediment_blocking_handled", title: "Sikring mot sediment, is og blokkering er dokumentert", branch: "dam_pipe", sourceRefs: ["NVE_2020_4_3"], sourceInterpretation: "Dam-pipe criteria include submerged/protected pipe and handling of sediment/blocking risk.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["pipe_through_dam_with_downstream_profile"] }),
  criterion({ id: "dam_gate_opening_downstream_measurement", title: "Nedstrøms målepunkt dokumenterer slippet", branch: "water_level_measurement", sourceRefs: ["NVE_2020_6_3", "NVE_2020_9", "NVE_2024_MVF_4_4"], sourceInterpretation: "For pipe through dam, gates, and openings, NVE usually requires downstream measurement rather than theoretical calculation alone.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["pipe_through_dam_with_downstream_profile", "gate_with_downstream_profile", "opening_in_dam_with_profile"] }),
  criterion({ id: "theoretical_only_documentation", title: "Kun teoretisk beregning er brukt som dokumentasjon", branch: "dam_pipe", sourceRefs: ["NVE_2020_4_3", "NVE_2024_MVF_4_2", "NVE_2024_MVF_4_4"], sourceInterpretation: "NVE sources warn that theoretical capacity alone is not sufficient documentation for relevant dam/gate/opening arrangements.", sourceScope: "warning", answerModel: "evidence_status" }),
  criterion({ id: "gate_electronic_level_or_opening", title: "Luke/vannstand/åpning registreres elektronisk eller med nedstrøms profil", branch: "gate", sourceRefs: ["NVE_2020_4_4", "NVE_2020_6_3", "NVE_2020_9"], sourceInterpretation: "Gate solutions need documented measurement through electronic registration and/or downstream profile where relevant.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["gate_with_downstream_profile"] }),
  criterion({ id: "gate_power_backup_winter_operation", title: "Strøm, backup og vinterdrift for luke er dokumentert", branch: "gate", sourceRefs: ["NVE_2020_4_4", "NVE_2020_3_1", "NVE_2020_8"], sourceInterpretation: "NVE's gate section highlights access, climate, power need, backup, and winter operation challenges.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["gate_with_downstream_profile"] }),
  criterion({ id: "opening_standard_profile", title: "Utsparing har standard/profilert geometri", branch: "opening_in_dam", sourceRefs: ["NVE_2020_4_5", "NVE_2020_9"], sourceInterpretation: "NVE's opening/notch section anchors standard profile and geometry as documentation criteria.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["opening_in_dam_with_profile"] }),
  criterion({ id: "opening_clogging_icing_protection", title: "Tilstopping og ising er håndtert", branch: "opening_in_dam", sourceRefs: ["NVE_2020_4_5", "NVE_2020_2_6"], sourceInterpretation: "NVE describes clogging and icing risks for openings/notches in dams.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["opening_in_dam_with_profile"] }),
  criterion({ id: "opening_low_water_capacity", title: "Kravet oppfylles ved laveste driftsvannstand", branch: "opening_in_dam", sourceRefs: ["NVE_2020_4_5"], sourceInterpretation: "Opening/notch capacity must be documented at lowest operating water level.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["opening_in_dam_with_profile"] }),
  criterion({ id: "fish_passage_release_relevant", title: "Fiskepassasje kan bære hele eller deler av minstevannføringen", branch: "fish_passage", sourceRefs: ["NVE_2020_5_1", "NVE_2020_9"], sourceInterpretation: "NVE allows the fish passage to govern or carry minimum-flow release where appropriate.", sourceScope: "accepted_method", answerModel: "evidence_status", requiredFor: ["fish_passage_release_and_measurement"] }),
  criterion({ id: "fish_passage_independent_upstream_level", title: "Fiskepassasje fungerer uavhengig av oppstrøms vannstand der relevant", branch: "fish_passage", sourceRefs: ["NVE_2020_5_1"], sourceInterpretation: "NVE states fish passage should function independently of upstream water level where relevant.", sourceScope: "documentation_requirement", answerModel: "evidence_status", requiredFor: ["fish_passage_release_and_measurement"] }),
  criterion({ id: "fish_passage_measurement_no_barrier", title: "Målearrangement er ikke vandringshinder og forsinker ikke fisk", branch: "fish_passage", sourceRefs: ["NVE_2020_5_1", "NVE_2020_6_3"], sourceInterpretation: "NVE states measurement must not create fish migration barriers or delays.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["fish_passage_release_and_measurement"] }),
  criterion({
    id: "coanda_return_point",
    title: "Slippunkt ved coanda-/tyrolerrist",
    branch: "coanda_tyrolean_screen",
    sourceRefs: ["NVE_2020_5_2", "NVE_2020_9"],
    sourceInterpretation: "Coanda source text addresses return point and dry-stretch risk below the intake.",
    sourceScope: "accepted_method",
    answerModel: "source_anchored_category",
    options: [
      option("coanda_return_over_or_right_downstream", "Over eller rett nedstrøms terskel", ["NVE_2020_5_2"], "Release returns over or immediately downstream of coanda threshold."),
      option("coanda_return_several_meters_downstream", "Flere meter nedstrøms", ["NVE_2020_5_2"], "Release returns farther downstream and can leave a dry stretch below intake."),
      option("not_documented_yet", "Ikke dokumentert ennå", ["NVE_2020_5_2"], "Return point is not documented.")
    ],
    requiredFor: ["coanda_tyrolean_source_specific"]
  }),
  criterion({
    id: "coanda_takeoff_point",
    title: "Uttakspunkt for coanda-slipp",
    branch: "coanda_tyrolean_screen",
    sourceRefs: ["NVE_2020_5_2"],
    sourceInterpretation: "NVE's coanda section describes source/takeoff alternatives for release water.",
    sourceScope: "context",
    answerModel: "source_anchored_category",
    options: [
      option("coanda_takeoff_upstream_or_intake_pool", "Oppstrøms/inntaksbasseng", ["NVE_2020_5_2"], "Release water is taken upstream or from intake pool."),
      option("coanda_takeoff_regulation_chamber", "Reguleringskammer", ["NVE_2020_5_2"], "Release water is taken through a regulation chamber."),
      option("coanda_takeoff_collection_sump_under_screen", "Samlekum under rist", ["NVE_2020_5_2"], "Release water is taken below screen and may carry air entrainment."),
      option("not_documented_yet", "Ikke dokumentert ennå", ["NVE_2020_5_2"], "Takeoff point is not documented.")
    ],
    requiredFor: ["coanda_tyrolean_source_specific"]
  }),
  criterion({ id: "coanda_low_fall_handled", title: "Lavt fall/liten høydeforskjell er håndtert", branch: "coanda_tyrolean_screen", sourceRefs: ["NVE_2020_5_2"], sourceInterpretation: "Coanda section identifies low fall/head as a source-backed design challenge.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["coanda_tyrolean_source_specific"] }),
  criterion({ id: "coanda_air_entrainment_handled", title: "Luftinnblanding fra vann under rist er håndtert", branch: "coanda_tyrolean_screen", sourceRefs: ["NVE_2020_5_2", "NVE_2020_6_2"], sourceInterpretation: "Coanda water taken below screens can entrain air; pipe meter criteria require air handling.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["coanda_tyrolean_source_specific"] }),
  criterion({ id: "alternative_special_justification", title: "Særskilt begrunnelse eller NVE-avklaring for alternativ metode", branch: "alternative_method", sourceRefs: ["NVE_2020_6_1", "NVE_2024_MVF_4"], sourceInterpretation: "Alternative methods outside the accepted source-backed set must not be recommended without special justification or NVE clarification.", sourceScope: "warning", answerModel: "evidence_status", requiredFor: ["alternative_method_requires_nve_clarification"] })
];

export const hydroGuideCards: HydroGuideCard[] = [
  { id: "project_requirement", title: "1. Prosjektkrav og konsesjonsgrunnlag", purpose: "Capture the actual minimum-flow requirement from concession/decision without inventing it.", sourceRefs: ["NVE_2020_1_4_1", "NVE_2020_1_3", "NVE_2020_2_6"], criterionIds: ["legal_requirement_documented", "minimum_flow_requirement_lps", "requirement_pattern"] },
  { id: "release_solution", title: "2. Slippløsning", purpose: "Capture the physical source-backed release solution category.", sourceRefs: ["NVE_2020_4_1", "NVE_2020_9"], criterionIds: ["release_solution_category"] },
  { id: "site_operation", title: "3. Sted- og driftsforhold", purpose: "Capture only source-backed constraints that affect method choice or operations.", sourceRefs: ["NVE_2020_3_1", "NVE_2020_2_6", "NVE_2020_8", "NVE_2024_ELV_4_6"], criterionIds: ["site_constraints"] },
  { id: "pipe_measurement", title: "4. Rørmåling", purpose: "Evaluate source-backed pipe-flow measurement criteria.", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2", "NVE_2024_MVF_4_2", "NVE_2020_9"], criterionIds: ["pipe_after_rack", "pipe_dry_frost_free", "pipe_full_through_meter", "pipe_air_handled", "pipe_straight_run_supplier_requirements", "pipe_calibration_control"], showWhen: { release_solution_category: ["pipe_via_intake", "coanda_tyrolean_screen"] } },
  { id: "water_level", title: "5. Vannstandsmåling og nedstrøms profil", purpose: "Evaluate water-level measurement with rating curve where relevant.", sourceRefs: ["NVE_2020_6_3", "NVE_2024_MVF_4_3", "NVE_2024_ELV_4_2_1", "NVE_2024_ELV_4_5"], criterionIds: ["water_level_rating_curve", "water_level_electronic_registration", "water_level_unambiguous_relationship"], showWhen: { release_solution_category: ["pipe_through_dam", "gate", "opening_in_dam", "fish_passage"] } },
  { id: "natural_profile", title: "6. Naturlig profil", purpose: "Evaluate natural profile criteria when water-level measurement uses a natural river profile.", sourceRefs: ["NVE_2020_6_3_3", "NVE_2024_MVF_4_3_1", "NVE_2024_ELV_4_5"], criterionIds: ["natural_profile_stable_control", "natural_profile_sufficient_measurements", "natural_profile_changes_handled"], showWhen: { release_solution_category: ["pipe_through_dam", "gate", "opening_in_dam"] } },
  { id: "artificial_profile", title: "7. Kunstig profil", purpose: "Evaluate artificial profile criteria where natural profile is unsuitable or artificial profile is selected.", sourceRefs: ["NVE_2020_6_3_4", "NVE_2024_MVF_4_3_2", "NVE_2024_ELV_4_5"], criterionIds: ["artificial_profile_suitable_when_natural_unsuitable", "artificial_profile_standard_construction", "artificial_profile_control_measurements", "artificial_profile_five_percent_verification"], showWhen: { release_solution_category: ["pipe_through_dam", "gate", "opening_in_dam"] } },
  { id: "dam_gate_opening", title: "8. Rør gjennom dam / luke / utsparing", purpose: "Evaluate release-specific criteria for dam pipe, gate, or opening arrangements.", sourceRefs: ["NVE_2020_4_3", "NVE_2020_4_4", "NVE_2020_4_5", "NVE_2020_6_3", "NVE_2020_9", "NVE_2024_MVF_4_4"], criterionIds: ["dam_pipe_below_lrv", "dam_pipe_capacity_margin_no_vortex", "dam_pipe_sediment_blocking_handled", "dam_gate_opening_downstream_measurement", "theoretical_only_documentation", "gate_electronic_level_or_opening", "gate_power_backup_winter_operation", "opening_standard_profile", "opening_clogging_icing_protection", "opening_low_water_capacity"], showWhen: { release_solution_category: ["pipe_through_dam", "gate", "opening_in_dam"] } },
  { id: "fish_passage", title: "9. Fiskepassasje", purpose: "Evaluate fish-passage release and measurement criteria.", sourceRefs: ["NVE_2020_5_1", "NVE_2020_6_3", "NVE_2020_9"], criterionIds: ["fish_passage_release_relevant", "fish_passage_independent_upstream_level", "fish_passage_measurement_no_barrier"], showWhen: { release_solution_category: "fish_passage" } },
  { id: "coanda", title: "10. Coanda / tyrolerrist", purpose: "Evaluate coanda-specific release point, takeoff, low-head, and air-entrainment criteria.", sourceRefs: ["NVE_2020_5_2", "NVE_2020_9"], criterionIds: ["coanda_return_point", "coanda_takeoff_point", "coanda_low_fall_handled", "coanda_air_entrainment_handled"], showWhen: { release_solution_category: "coanda_tyrolean_screen" } },
  { id: "alternative_method", title: "11. Alternativ metode / NVE-avklaring", purpose: "Show when selected approach is outside the source-backed accepted method set.", sourceRefs: ["NVE_2020_6_1", "NVE_2024_MVF_4"], criterionIds: ["alternative_special_justification"], showWhen: { release_solution_category: "other_alternative" } }
];

export const hydroGuideMethodCandidates: HydroGuideMethodCandidate[] = [
  { id: "pipe_via_intake_with_pipe_flow_meter", label: "Rør via inntak med rørflowmåler", releaseSolutionCode: "S1", measurementMethodCode: "M1", sourceRefs: ["NVE_2020_4_2", "NVE_2020_6_2", "NVE_2024_MVF_4_2", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "pipe_after_rack", "pipe_dry_frost_free", "pipe_full_through_meter", "pipe_air_handled", "pipe_straight_run_supplier_requirements", "pipe_calibration_control"], warningCriteria: [], rejectionCriteria: ["pipe_air_handled"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "pipe_through_dam_with_downstream_profile", label: "Rør gjennom dam med nedstrøms måleprofil", releaseSolutionCode: "S2", measurementMethodCode: "M2", sourceRefs: ["NVE_2020_4_3", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "dam_pipe_below_lrv", "dam_pipe_capacity_margin_no_vortex", "dam_pipe_sediment_blocking_handled", "dam_gate_opening_downstream_measurement"], warningCriteria: ["theoretical_only_documentation"], rejectionCriteria: ["dam_pipe_below_lrv", "dam_pipe_capacity_margin_no_vortex", "dam_pipe_sediment_blocking_handled"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "gate_with_downstream_profile", label: "Luke med elektronisk dokumentasjon og nedstrøms profil", releaseSolutionCode: "S3", measurementMethodCode: "M2", sourceRefs: ["NVE_2020_4_4", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "gate_electronic_level_or_opening", "gate_power_backup_winter_operation", "dam_gate_opening_downstream_measurement"], warningCriteria: [], rejectionCriteria: ["gate_electronic_level_or_opening"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "opening_in_dam_with_profile", label: "Utsparing i dam med dokumenterende profil", releaseSolutionCode: "S4", measurementMethodCode: "M3", sourceRefs: ["NVE_2020_4_5", "NVE_2020_6_3", "NVE_2024_MVF_4_4", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "opening_standard_profile", "opening_clogging_icing_protection", "opening_low_water_capacity", "dam_gate_opening_downstream_measurement"], warningCriteria: [], rejectionCriteria: ["opening_clogging_icing_protection", "opening_low_water_capacity"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "fish_passage_release_and_measurement", label: "Fiskepassasje med hydraulisk dokumentert slipp", releaseSolutionCode: "S5", measurementMethodCode: "M6", sourceRefs: ["NVE_2020_5_1", "NVE_2020_6_3", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "fish_passage_release_relevant", "fish_passage_independent_upstream_level", "fish_passage_measurement_no_barrier"], warningCriteria: [], rejectionCriteria: ["fish_passage_measurement_no_barrier"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "coanda_tyrolean_source_specific", label: "Coanda-/tyrolerrist med prosjektspesifikk dokumentasjon", releaseSolutionCode: "S6", measurementMethodCode: "M7", sourceRefs: ["NVE_2020_5_2", "NVE_2020_9"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "coanda_return_point", "coanda_takeoff_point", "coanda_low_fall_handled", "coanda_air_entrainment_handled"], warningCriteria: [], rejectionCriteria: ["coanda_low_fall_handled", "coanda_air_entrainment_handled"], implicitObligationIds: [...universalNveObligationIds] },
  { id: "alternative_method_requires_nve_clarification", label: "Alternativ metode som krever særskilt begrunnelse eller NVE-avklaring", releaseSolutionCode: "S7", measurementMethodCode: "M8", sourceRefs: ["NVE_2020_6_1", "NVE_2024_MVF_4"], requiredCriteria: ["legal_requirement_documented", "minimum_flow_requirement_lps", "release_solution_category", "alternative_special_justification"], warningCriteria: [], rejectionCriteria: [], implicitObligationIds: [...universalNveObligationIds] }
];

const methodByRelease: Record<string, string> = {
  pipe_via_intake: "pipe_via_intake_with_pipe_flow_meter",
  pipe_through_dam: "pipe_through_dam_with_downstream_profile",
  gate: "gate_with_downstream_profile",
  opening_in_dam: "opening_in_dam_with_profile",
  fish_passage: "fish_passage_release_and_measurement",
  coanda_tyrolean_screen: "coanda_tyrolean_source_specific",
  other_alternative: "alternative_method_requires_nve_clarification"
};

export function createEmptyHydroGuideAnswers(): HydroGuideAnswers {
  const answers: HydroGuideAnswers = {};
  for (const criterion of hydroGuideCriteria) {
    if (criterion.answerModel === "multi_select_source_anchored") answers[criterion.id] = [];
    else if (criterion.answerModel === "numeric") answers[criterion.id] = "";
    else answers[criterion.id] = criterion.answerModel === "evidence_status" ? MISSING : "";
  }
  return answers;
}

function isEvidence(value: HydroGuideAnswerValue): value is EvidenceStatus {
  return value === PASS || value === FAIL || value === MISSING;
}

function criterionMap() {
  return new Map(hydroGuideCriteria.map((item) => [item.id, item]));
}

function selectedMethod(answers: HydroGuideAnswers): HydroGuideMethodCandidate {
  const release = String(answers.release_solution_category || "");
  return hydroGuideMethodCandidates.find((item) => item.id === methodByRelease[release]) ?? hydroGuideMethodCandidates[6];
}

function checkCriterionValue(answers: HydroGuideAnswers, id: string): "satisfied" | "failed" | "missing" {
  const value = answers[id];
  const meta = criterionMap().get(id);
  if (!meta) return "missing";

  if (meta.answerModel === "evidence_status") {
    if (value === PASS) return "satisfied";
    if (value === FAIL) return "failed";
    return "missing";
  }
  if (meta.answerModel === "numeric") return typeof value === "number" && Number.isFinite(value) && value > 0 ? "satisfied" : "missing";
  if (meta.answerModel === "multi_select_source_anchored") return Array.isArray(value) && value.length > 0 ? "satisfied" : "missing";
  if (id === "release_solution_category") {
    if (value === "other_alternative") return "missing";
    return typeof value === "string" && value.length > 0 && value !== "not_documented_yet" ? "satisfied" : "missing";
  }
  return typeof value === "string" && value.length > 0 && value !== "not_documented_yet" ? "satisfied" : "missing";
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sourceRefsFor(criteriaIds: string[], extra: string[] = []): string[] {
  const map = criterionMap();
  return dedupe([...extra, ...criteriaIds.flatMap((id) => map.get(id)?.sourceRefs ?? [])]);
}

function obligationsFor(ids: string[]) {
  const allowed = new Set(ids);
  return universalNveObligations.filter((item) => allowed.has(item.id));
}

function hasAnyDocumentedEvidence(answers: HydroGuideAnswers, ids: string[]): boolean {
  return ids.some((id) => {
    const value = answers[id];
    return value === PASS || value === FAIL;
  });
}

function displayCriterion(id: string) {
  const meta = criterionMap().get(id);
  return meta ? `${meta.title} (${meta.sourceRefs.join(", ")})` : id;
}

export function calculateHydroGuideDecision(answers: HydroGuideAnswers): HydroGuideDecision {
  const method = selectedMethod(answers);
  const waterLevelDetailIds = ["water_level_rating_curve", "water_level_electronic_registration", "water_level_unambiguous_relationship"];
  const naturalProfileDetailIds = ["natural_profile_stable_control", "natural_profile_sufficient_measurements", "natural_profile_changes_handled"];
  const artificialProfileDetailIds = [
    "artificial_profile_suitable_when_natural_unsuitable",
    "artificial_profile_standard_construction",
    "artificial_profile_control_measurements",
    "artificial_profile_five_percent_verification"
  ];
  const criteriaToCheck = dedupe([
    ...method.requiredCriteria,
    ...(hasAnyDocumentedEvidence(answers, waterLevelDetailIds) ? waterLevelDetailIds : []),
    ...(hasAnyDocumentedEvidence(answers, naturalProfileDetailIds) ? naturalProfileDetailIds : []),
    ...(hasAnyDocumentedEvidence(answers, artificialProfileDetailIds) ? artificialProfileDetailIds : [])
  ]);
  const satisfied: string[] = [];
  const failed: string[] = [];
  const missing: string[] = [];

  for (const id of criteriaToCheck) {
    const state = checkCriterionValue(answers, id);
    if (state === "satisfied") satisfied.push(id);
    if (state === "failed") failed.push(id);
    if (state === "missing") missing.push(id);
  }

  const warnings = [];
  if (
    ["pipe_through_dam_with_downstream_profile", "gate_with_downstream_profile", "opening_in_dam_with_profile"].includes(method.id) &&
    answers.theoretical_only_documentation === PASS
  ) {
    warnings.push({
      id: "theoretical_only_not_sufficient",
      title: "Teoretisk beregning alene er ikke tilstrekkelig dokumentasjon.",
      sourceRefs: ["NVE_2020_4_3", "NVE_2024_MVF_4_2", "NVE_2024_MVF_4_4"],
      criterionIds: ["theoretical_only_documentation", "dam_gate_opening_downstream_measurement"]
    });
    if (!missing.includes("dam_gate_opening_downstream_measurement") && answers.dam_gate_opening_downstream_measurement !== PASS) {
      missing.push("dam_gate_opening_downstream_measurement");
    }
  }

  if (method.id === "coanda_tyrolean_source_specific" && answers.coanda_return_point === "coanda_return_several_meters_downstream") {
    failed.push("coanda_return_point");
    warnings.push({
      id: "coanda_dry_stretch_risk",
      title: "Coanda-slipp flere meter nedstrøms kan gi tørr strekning rett nedenfor inntaket.",
      sourceRefs: ["NVE_2020_5_2"],
      criterionIds: ["coanda_return_point"]
    });
  }

  const hasAlternative = method.id === "alternative_method_requires_nve_clarification";
  const status: HydroGuideDecisionStatus = hasAlternative
    ? "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
    : failed.length > 0
      ? "FRARADET_KILDEFORANKRET"
      : missing.length > 0
        ? "MULIG_MEN_MANGLER_STEDSSPESIFIKK_GRUNNLAG"
        : "ANBEFALT_KILDEFORANKRET";

  const sourceRefs = sourceRefsFor([...satisfied, ...failed, ...missing], method.sourceRefs);
  const implicitObligations = obligationsFor(method.implicitObligationIds);
  const explanation =
    status === "ANBEFALT_KILDEFORANKRET"
      ? `${method.label} er anbefalt fordi de stedsspesifikke kildeforankrede metodekriteriene er dokumentert oppfylt.`
      : status === "FRARADET_KILDEFORANKRET"
        ? `${method.label} frarådes fordi disse kildeforankrede metodekriteriene er dokumentert ikke oppfylt: ${failed.map(displayCriterion).join("; ")}.`
        : status === "KREVER_SAERSKILT_BEGRUNNELSE_ELLER_NVE_AVKLARING"
          ? `${method.label} ligger utenfor normal kildeforankret metodeanbefaling og krever særskilt begrunnelse eller NVE-avklaring.`
          : `${method.label} kan være aktuell, men mangler stedsspesifikt grunnlag for: ${missing.map(displayCriterion).join("; ")}.`;

  return {
    status,
    methodId: method.id,
    methodLabel: method.label,
    sourceRefs,
    satisfiedCriteria: dedupe(satisfied),
    failedCriteria: dedupe(failed),
    missingSiteCriteria: dedupe(missing),
    criteriaSatisfied: dedupe(satisfied),
    criteriaNotSatisfied: dedupe(failed),
    missingDocumentation: dedupe(missing),
    implicitObligations,
    explanation,
    explanationSourceRefs: sourceRefs,
    warnings
  };
}

export function validateSourceAnchoredModel(): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(Object.keys(nveSourceRegister));
  const criteriaIds = new Set(hydroGuideCriteria.map((item) => item.id));
  const methodIds = new Set(hydroGuideMethodCandidates.map((item) => item.id));

  for (const criterion of hydroGuideCriteria) {
    if (!criterion.sourceRefs.length) errors.push(`${criterion.id} missing sourceRefs`);
    if (!criterion.sourceInterpretation) errors.push(`${criterion.id} missing sourceInterpretation`);
    for (const sourceId of criterion.sourceRefs) if (!sourceIds.has(sourceId)) errors.push(`${criterion.id} references unknown source ${sourceId}`);
    for (const option of criterion.options ?? []) {
      if (!option.sourceRefs.length) errors.push(`${criterion.id}.${option.id} missing sourceRefs`);
      if (!option.semanticMeaning) errors.push(`${criterion.id}.${option.id} missing semanticMeaning`);
      for (const sourceId of option.sourceRefs) if (!sourceIds.has(sourceId)) errors.push(`${criterion.id}.${option.id} references unknown source ${sourceId}`);
    }
  }
  for (const card of hydroGuideCards) {
    if (!card.sourceRefs.length) errors.push(`${card.id} missing sourceRefs`);
    for (const criterionId of card.criterionIds) if (!criteriaIds.has(criterionId)) errors.push(`${card.id} references unknown criterion ${criterionId}`);
  }
  for (const method of hydroGuideMethodCandidates) {
    if (!method.sourceRefs.length) errors.push(`${method.id} missing sourceRefs`);
    if (!method.requiredCriteria.length) errors.push(`${method.id} missing requiredCriteria`);
    if (method.id !== "alternative_method_requires_nve_clarification" && method.requiredCriteria.length === 0) errors.push(`${method.id} has no required criteria`);
    for (const criterionId of [...method.requiredCriteria, ...method.warningCriteria, ...method.rejectionCriteria]) {
      if (!criteriaIds.has(criterionId)) errors.push(`${method.id} references unknown criterion ${criterionId}`);
    }
    for (const obligationId of method.implicitObligationIds) {
      if (!universalNveObligationIds.includes(obligationId)) errors.push(`${method.id} references unknown obligation ${obligationId}`);
    }
  }
  for (const id of methodIds) {
    if (!hydroGuideCriteria.some((criterion) => criterion.requiredFor?.includes(id))) {
      errors.push(`${id} is not referenced by any criterion requiredFor`);
    }
  }
  return errors;
}

export function buildSourceAnchoredReportSummary(decision: HydroGuideDecision): SourceAnchoredReportSummary {
  const map = criterionMap();
  const criterionItem = (id: string) => {
    const meta = map.get(id);
    return { id, title: meta?.title ?? id, sourceRefs: meta?.sourceRefs ?? [] };
  };
  const obligationSourceIds = decision.implicitObligations.flatMap((item) => item.sourceRefs);
  const sourceReferences = dedupe([...decision.sourceRefs, ...obligationSourceIds]).map((id) => sourceRef(id, obligationSourceIds.includes(id) ? "implicit_obligation" : "documentation_requirement"));
  return {
    selectedMethod: decision.methodLabel,
    satisfiedCriteria: decision.criteriaSatisfied.map(criterionItem),
    failedCriteria: decision.criteriaNotSatisfied.map(criterionItem),
    missingDocumentation: decision.missingDocumentation.map(criterionItem),
    missingSiteCriteria: decision.missingSiteCriteria.map(criterionItem),
    sourceReferences,
    systemAssumptions: [secureDataStorageReportRequirement, ...decision.implicitObligations.map((item) => ({ text: item.obligationText, sourceRefs: item.sourceRefs }))],
    implicitObligations: decision.implicitObligations
  };
}

export function visibleHydroGuideCards(answers: HydroGuideAnswers): HydroGuideCard[] {
  return hydroGuideCards.filter((card) => {
    if (!card.showWhen) return true;
    return Object.entries(card.showWhen).every(([key, expected]) => {
      const actual = answers[key];
      return Array.isArray(expected) ? expected.includes(String(actual)) : actual === expected;
    });
  });
}

export function isEvidenceStatus(value: HydroGuideAnswerValue): value is EvidenceStatus {
  return isEvidence(value);
}

export { nveSourceRegister };
export { universalNveObligations };
export type { EvidenceStatus, HydroGuideAnswers } from "./sourceAnchoredModel";
