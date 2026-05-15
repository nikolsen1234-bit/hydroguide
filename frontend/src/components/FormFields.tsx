import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatNumberDraft } from "../utils/format";
import {
  workspaceContentValueClassName,
  workspaceFieldLabelClassName,
  workspaceFieldLabelRowClassName,
  workspaceFieldStackClassName,
  workspaceInputClassName
} from "../styles/workspace";
import { HelpTip } from "./WorkspaceActions";

interface BaseProps {
  label: string;
  helper?: string;
  error?: string;
  ariaLabel?: string;
  reserveErrorSpace?: boolean;
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
  id,
  reserveSpace = true
}: Pick<BaseProps, "error"> & {
  id?: string;
  reserveSpace?: boolean;
}) {
  if (!error && !reserveSpace) {
    return null;
  }

  return (
    <p
      id={id}
      className={`${workspaceContentValueClassName} text-rose-600`}
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
  reserveErrorSpace = true,
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
      <FieldError error={error} id={errorId} reserveSpace={reserveErrorSpace} />
    </div>
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
  reserveErrorSpace,
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
    <FieldWrapper label={label} helper={helper} error={error} reserveErrorSpace={reserveErrorSpace} fieldId={fieldId} errorId={errorId}>
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
          className={`${workspaceInputClassName} ${unit ? "pr-20" : ""}`}
          aria-label={ariaLabel}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
        />
        {unit ? (
          <span className="hg-mono pointer-events-none absolute inset-y-0 right-3 flex items-center text-[length:var(--hg-type-badge-size)] font-[var(--hg-type-weight-semibold)] text-[var(--hg-ink)]">
            {unit}
          </span>
        ) : null}
      </div>
    </FieldWrapper>
  );
}

