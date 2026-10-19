import { Circle, Flag, Heart, Star, ThumbsUp } from "lucide-react";

import type { Field } from "../../api/types";
const icons = { star: Star, heart: Heart, thumbs_up: ThumbsUp, flag: Flag, circle: Circle };
export function Rating({ field, value, onChange }: { field: Field; value: unknown; onChange?: (value: unknown) => void }) {
  const rating = field.config.rating!;
  const Icon = icons[rating.icon];
  const score = typeof value === "number" ? value : 0;
  const symbols = Array.from({ length: rating.max }, (_, index) => index + 1);
  if (!onChange) {
    return (
      <span className={`rating rating-${rating.color}`} aria-label={`${score} of ${rating.max}`} title={`${score} / ${rating.max}`}>
        {symbols.map((n) => (
          <Icon key={n} size={14} fill={n <= score ? "currentColor" : "none"} className={n <= score ? "" : "rating-empty"} />
        ))}
      </span>
    );
  }
  return (
    <div className="rating-editor">
      <div
        role="radiogroup"
        aria-label={field.name}
        className={`rating rating-${rating.color}`}
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? rating.max
                : Math.max(0, Math.min(rating.max, score + (["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1)));
          onChange(next);
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-rating="${next}"]`)?.focus();
        }}
      >
        <button
          type="button"
          role="radio"
          data-rating={0}
          aria-label="0"
          aria-checked={value === 0}
          tabIndex={score === 0 ? 0 : -1}
          onClick={() => onChange(0)}
        >
          0
        </button>
        {symbols.map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            data-rating={n}
            aria-label={`${n}`}
            aria-checked={score === n}
            tabIndex={score === n ? 0 : -1}
            onClick={() => onChange(n)}
          >
            <Icon size={19} fill={n <= score ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <span className="field-hint">{value == null ? "Unrated" : `${score} / ${rating.max}`}</span>
      {!field.required && (
        <button type="button" className="text-button" onClick={() => onChange(null)}>
          Clear rating
        </button>
      )}
    </div>
  );
}
