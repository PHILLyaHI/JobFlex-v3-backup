"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./Input";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "suffix">;

// Password field with a show/hide toggle. Wraps the shared Input and swaps the
// type between "password" and "text" via the suffix eye button.
export function PasswordInput(props: PasswordInputProps) {
  const [show, setShow] = React.useState(false);
  return (
    <Input
      {...props}
      type={show ? "text" : "password"}
      suffix={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}
