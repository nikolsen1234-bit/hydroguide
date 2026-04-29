import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "../i18n";
import {
  workspaceFieldLabelClassName,
  workspaceFieldLabelRowClassName,
  workspaceFieldStackClassName,
  workspaceInputClassName
} from "../styles/workspace";
import { JaNei, NullableBoolean } from "../types";
import { HelpTip } from "./WorkspaceActions";

interface BaseProps {
  label: string;
  helper?: string;
  error?: string;
  ariaLabel?: string;
}

interface ChoiceOption<T extends string | boolean> {
  value: T;
  label: string;
}

function FieldLabel({
  label,
  helper,
  htmlFor
}: Pick<BaseProps, "label" | "helper"> & {
  htmlFor?: string;
}) {
  if (label.trim() === "" && !helper) {
    return null;
  }

  return (
    <div className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName}`}>
      {label.trim() !== "" ? <label htmlFor={htmlFor}>{label}</label> : <span />}
      {helper ? <HelpTip text={helper} /> : null}
    </div>
  );
}

function FieldError({
  error,
  id
}: Pick<BaseProps, "error"> & {
  id?: string;
}) {
  return (
    <p
      id={id}
      className="text-sm font-medium text-rose-600"
      style={{ minHeight: "1.25rem", visibility: error ? "visible" : "hidden" }}
    >
      {error ?? " "}
    </p>
  );
}

function FieldWrapper({
  label,
  helper,
  error,
  fieldId,
  errorId,
  children
}: BaseProps & {
  fieldId?: string;
  errorId?: string;
  children: ReactNode;
}) {
  const hasLabelRow = label.trim() !== "" || Boolean(helper);

  return (
    <div className={`block ${hasLabelRow ? workspaceFieldStackClassName : "space-y-0"}`}>
      <FieldLabel label={label} helper={helper} htmlFor={fieldId} />
      {children}
      <FieldError error={error} id={errorId} />
    </div>
  );
}

function ChoiceField<T extends string | boolean>({
  label,
  helper,
  error,
  value,
  onChange,
  options
}: BaseProps & {
  value: T | "" | null;
  onChange: (value: T) => void;
  options: ChoiceOption<T>[];
}) {
  return (
    <fieldset className={workspaceFieldStackClassName}>
      <legend className={`${workspaceFieldLabelRowClassName} ${workspaceFieldLabelClassName}`}>
        <span>{label}</span>
        {helper ? <HelpTip text={helper} /> : null}
      </legend>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                selected
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-950 hover:border-brand-300"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <FieldError error={error} />
    </fieldset>
  );
}

function formatNumberDraft(value: number | ""): string {
  return value === "" ? "" : String(value);
}

interface SelectFieldProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

export function SelectField({ label, helper, error, ariaLabel, value, onChange, options }: SelectFieldProps) {
  const { t } = useLanguage();
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <FieldWrapper label={label} helper={helper} error={error} fieldId={fieldId} errorId={errorId}>
      <select
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={workspaceInputClassName}
        aria-label={ariaLabel}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
      >
        <option value="">{t("shared.selectOption")}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

interface NumberFieldProps extends BaseProps {
  value: number | "";
  onChange: (value: number | "") => void;
  min?: number;
  max?: number;
  step?: number | "any";
  unit?: string;
  placeholder?: string;
}

export function NumberField({
  label,
  helper,
  error,
  ariaLabel,
  value,
  onChange,
  min = 0,
  max,
  step: _step = "any",
  unit,
  placeholder
}: NumberFieldProps) {
  const [draftValue, setDraftValue] = useState(() => formatNumberDraft(value));
  const isEditingRef = useRef(false);
  const allowNegative = min === undefined || min < 0;
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;

  useEffect(() => {
    if (!isEditingRef.current) {
      setDraftValue(formatNumberDraft(value));
    }
  }, [value]);

  return (
    <FieldWrapper label={label} helper={helper} error={error} fieldId={fieldId} errorId={errorId}>
      <div className="relative">
        <input
          id={fieldId}
          type="text"
          inputMode="decimal"
          value={draftValue}
          placeholder={placeholder}
          onFocus={() => {
            isEditingRef.current = true;
          }}
          onChange={(event) => {
            const normalized = event.target.value.replace(",", ".");
            const pattern = allowNegative ? /^-?\d*(?:\.\d*)?$/ : /^\d*(?:\.\d*)?$/;

            if (!pattern.test(normalized)) {
              return;
            }

            setDraftValue(normalized);

            if (normalized === "") {
              onChange("");
              return;
            }

            if (normalized === "." || normalized === "-" || normalized === "-." || normalized.endsWith(".")) {
              return;
            }

            const numericValue = Number(normalized);
            if (Number.isNaN(numericValue)) {
              return;
            }

            if ((min !== undefined && numericValue < min) || (max !== undefined && numericValue > max)) {
              onChange(numericValue);
              return;
            }

            onChange(numericValue);
          }}
          onBlur={() => {
            isEditingRef.current = false;

            if (draftValue === "" || draftValue === "." || draftValue === "-" || draftValue === "-.") {
              setDraftValue("");
              onChange("");
              return;
            }

            const numericValue = Number(draftValue);
            if (Number.isNaN(numericValue)) {
              setDraftValue(formatNumberDraft(value));
              return;
            }

            onChange(numericValue);
          }}
          className={`${workspaceInputClassName} ${unit ? "pr-24" : ""}`}
          aria-label={ariaLabel}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-slate-950">
            {unit}
          </span>
        ) : null}
      </div>
    </FieldWrapper>
  );
}

interface TextFieldProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextField({ label, helper, error, ariaLabel, value, onChange, placeholder }: TextFieldProps) {
  const fieldId = useId();
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <FieldWrapper label={label} helper={helper} error={error} fieldId={fieldId} errorId={errorId}>
      <input
        id={fieldId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={workspaceInputClassName}
        aria-label={ariaLabel}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
      />
    </FieldWrapper>
  );
}

interface BooleanChoiceFieldProps extends BaseProps {
  value: NullableBoolean;
  onChange: (value: boolean) => void;
  trueLabel?: string;
  falseLabel?: string;
}

export function BooleanChoiceField({
  label,
  helper,
  error,
  value,
  onChange,
  trueLabel,
  falseLabel
}: BooleanChoiceFieldProps) {
  const { t } = useLanguage();
  const resolvedTrueLabel = trueLabel ?? t("shared.yes");
  const resolvedFalseLabel = falseLabel ?? t("shared.no");
  return (
    <ChoiceField
      label={label}
      helper={helper}
      error={error}
      value={value}
      onChange={onChange}
      options={[
        { value: true, label: resolvedTrueLabel },
        { value: false, label: resolvedFalseLabel }
      ]}
    />
  );
}

interface JaNeiFieldProps extends BaseProps {
  value: JaNei | "";
  onChange: (value: JaNei) => void;
}

export function JaNeiField({ label, helper, error, value, onChange }: JaNeiFieldProps) {
  const { t } = useLanguage();
  return (
    <ChoiceField
      label={label}
      helper={helper}
      error={error}
      value={value}
      onChange={onChange}
      options={[
        { value: "ja", label: t("shared.yes") },
        { value: "nei", label: t("shared.no") }
      ]}
    />
  );
}
