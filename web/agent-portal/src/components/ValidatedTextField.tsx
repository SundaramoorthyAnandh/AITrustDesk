import { TextField, type TextFieldProps } from '@mui/material';
import { useState } from 'react';

/** A validator returns an error message for an invalid value, else undefined. */
export type Validator = (value: string) => string | undefined;

export const validators = {
  required:
    (msg = 'This field is required'): Validator =>
    (v) =>
      v.trim().length > 0 ? undefined : msg,
  email:
    (msg = 'Enter a valid email address'): Validator =>
    (v) =>
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? undefined : msg,
  minLen:
    (n: number, msg?: string): Validator =>
    (v) =>
      v.length >= n ? undefined : msg ?? `Must be at least ${n} characters`,
  maxLen:
    (n: number, msg?: string): Validator =>
    (v) =>
      v.length <= n ? undefined : msg ?? `Must be at most ${n} characters`,
  integerMin:
    (min: number, msg?: string): Validator =>
    (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= min ? undefined : msg ?? `Must be an integer ≥ ${min}`;
    },
};

/** First failing rule's message (or undefined if all pass). */
export function firstError(value: string, rules: Validator[]): string | undefined {
  for (const r of rules) {
    const e = r(value);
    if (e) return e;
  }
  return undefined;
}

type Props = Omit<TextFieldProps, 'value' | 'onChange' | 'error' | 'helperText'> & {
  value: string;
  onChange: (value: string) => void;
  rules?: Validator[];
  helperText?: string;
};

/**
 * TextField that validates reactively: shows an error helper text as soon as the
 * field is dirty (has content) or has been blurred, without waiting for submit.
 */
export function ValidatedTextField({ value, onChange, rules = [], helperText, onBlur, ...rest }: Props) {
  const [touched, setTouched] = useState(false);
  const error = firstError(value, rules);
  const show = (touched || value.length > 0) && Boolean(error);
  return (
    <TextField
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        setTouched(true);
        onBlur?.(e);
      }}
      error={show}
      helperText={show ? error : helperText}
    />
  );
}
