import {
  AlignLeft,
  ArrowDownUp,
  Binary,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckSquare2,
  Clock3,
  Folder,
  Gamepad2,
  Hash,
  Link2,
  ListFilter,
  Paperclip,
  Table2,
  Tag,
  Text,
  Type,
  Globe2,
} from "lucide-react";
import type { FieldType } from "../api/types";
const formIcons = {
  table: Table2,
  briefcase: BriefcaseBusiness,
  gamepad: Gamepad2,
  folder: Folder,
  building: Building2,
  tag: Tag,
  book: BookOpen,
};
export function FormIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const Icon = formIcons[icon as keyof typeof formIcons] ?? Table2;
  return <Icon size={size} strokeWidth={1.6} />;
}
const fieldIcons = {
  short_text: Type,
  long_text: AlignLeft,
  integer: Hash,
  decimal: Binary,
  boolean: CheckSquare2,
  date: CalendarDays,
  date_time: Clock3,
  duration: Clock3,
  url: Globe2,
  relation: Link2,
  attachment: Paperclip,
};
export function FieldIcon({ type }: { type: FieldType }) {
  const Icon = fieldIcons[type] ?? Text;
  return <Icon size={14} strokeWidth={1.5} />;
}
export { ArrowDownUp, ListFilter };
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path fill="currentColor" d="M0 0h32v32H0z" />
      <path fill="none" stroke="var(--paper)" strokeWidth="1.7" d="M8 24V8h16M8 16h12M16 8v16" />
    </svg>
  );
}
