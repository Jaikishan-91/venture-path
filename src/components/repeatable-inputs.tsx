"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function splitInitial(value: string, separator: string) {
  const parts = value
    .split(separator === "," ? /,/ : /\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [""];
}

export function RepeatableInputs({
  label,
  itemLabel,
  name,
  initial,
  separator,
  max,
  placeholder,
  hint,
}: {
  label: string;
  itemLabel: string;
  name: string;
  initial: string;
  separator: "," | "\n";
  max: number;
  placeholder?: string;
  hint: string;
}) {
  const [items, setItems] = useState(() => splitInitial(initial, separator));
  const hintId = `${name}-hint`;

  function update(index: number, value: string) {
    setItems((current) => current.map((item, i) => (i === index ? value : item)));
  }

  function add() {
    setItems((current) => (current.length >= max ? current : [...current, ""]));
  }

  function remove(index: number) {
    setItems((current) => {
      const next = current.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  }

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="text-sm font-medium">{label}</legend>
      {items.map((item, index) => {
        const itemName = index === 0 ? itemLabel : `${itemLabel} ${index + 1}`;
        return (
          <div key={index} className="flex gap-2">
            <Input
              name={name}
              value={item}
              aria-label={itemName}
              placeholder={placeholder}
              maxLength={name === "links" ? 200 : 40}
              onChange={(event) => update(index, event.target.value)}
            />
            {items.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove ${itemName}`}
                onClick={() => remove(index)}
              >
                <X strokeWidth={1.75} />
              </Button>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="self-start"
        aria-label={`Add ${itemLabel.toLowerCase()}`}
        disabled={items.length >= max}
        onClick={add}
      >
        <Plus strokeWidth={1.75} />
      </Button>
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </fieldset>
  );
}
