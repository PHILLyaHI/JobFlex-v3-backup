"use client";
import { useState } from "react";

export function ThrowButton() {
  const [armed, setArmed] = useState(false);
  // The email and the digits are bait: the reporter must strike both.
  if (armed) throw new Error("dev/throw: client render, reach me at qa@acme.test 5551234567");
  return (
    <button type="button" onClick={() => setArmed(true)} style={{ minHeight: 44, padding: "0 18px", border: "2px solid #111", background: "#fff", fontWeight: 600, cursor: "pointer" }}>
      Throw a render error
    </button>
  );
}
