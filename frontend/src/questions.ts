import { hydroGuideCards, hydroGuideCriteria, visibleHydroGuideCards } from "./hydroguide/sourceAnchoredDecision";
import type { SourceScope } from "./hydroguide/sourceAnchoredModel";
import { Answers } from "./types";

interface Option<T extends string = string> {
  value: T;
  label: string;
  sourceRefs: string[];
  semanticMeaning: string;
  isAppOperationalization?: boolean;
}

export interface Question<T extends keyof Answers = keyof Answers> {
  key: T;
  label: string;
  helper?: string;
  sourceRefs: string[];
  sourceInterpretation: string;
  sourceScope: SourceScope;
  input: "yesNo" | "select" | "number" | "multiSelect";
  options?: Option[];
  hidden?: boolean;
  required?: boolean;
  condition?: (answers: Answers) => boolean;
}

export interface QuestionSection {
  id: string;
  title: string;
  purpose: string;
  sourceRefs: string[];
  questions: Question[];
}

const criteriaById = new Map(hydroGuideCriteria.map((criterion) => [criterion.id, criterion]));

function inputFor(answerModel: (typeof hydroGuideCriteria)[number]["answerModel"]): Question["input"] {
  if (answerModel === "numeric") return "number";
  if (answerModel === "multi_select_source_anchored") return "multiSelect";
  return "select";
}

function matchesWhen(answers: Answers, showWhen: NonNullable<(typeof hydroGuideCriteria)[number]["visibleWhen"]>) {
  return Object.entries(showWhen).every(([key, expected]) => {
    const actual = answers[key];
    return Array.isArray(expected) ? expected.includes(String(actual)) : actual === expected;
  });
}

function criterionToQuestion(criterionId: string): Question {
  const criterion = criteriaById.get(criterionId);
  if (!criterion) {
    throw new Error(`Unknown HydroGuide criterion: ${criterionId}`);
  }

  return {
    key: criterion.id,
    label: criterion.title,
    helper: criterion.sourceInterpretation,
    sourceRefs: criterion.sourceRefs,
    sourceInterpretation: criterion.sourceInterpretation,
    sourceScope: criterion.sourceScope,
    input: inputFor(criterion.answerModel),
    options: criterion.options?.map((item) => ({
      value: item.id,
      label: item.label,
      sourceRefs: item.sourceRefs,
      semanticMeaning: item.semanticMeaning,
      isAppOperationalization: item.isAppOperationalization
    })),
    required: criterion.required ?? true,
    condition: criterion.visibleWhen ? (answers) => matchesWhen(answers, criterion.visibleWhen!) : undefined
  };
}

export function sectionsForAnswers(answers: Answers): QuestionSection[] {
  const visibleCardIds = new Set(visibleHydroGuideCards(answers).map((card) => card.id));
  return sections.filter((section) => visibleCardIds.has(section.id));
}

export function visibleQuestionsForAnswers(answers: Answers): Question[] {
  return sectionsForAnswers(answers).flatMap((section) => section.questions.filter((question) => !question.condition || question.condition(answers)));
}

export const sections: QuestionSection[] = hydroGuideCards.map((card) => ({
  id: card.id,
  title: card.title,
  purpose: card.purpose,
  sourceRefs: card.sourceRefs,
  questions: card.criterionIds.map(criterionToQuestion)
}));
