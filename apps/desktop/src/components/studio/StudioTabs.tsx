import { Segmented } from "@nous-research/ui/ui/components/segmented";

export type StudioTab = "image" | "video" | "templates" | "enhance" | "marketing" | "lipsync" | "cinema" | "workflows";

const OPTIONS: { label: string; value: StudioTab }[] = [
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Templates", value: "templates" },
  { label: "Enhance", value: "enhance" },
  { label: "Marketing", value: "marketing" },
  { label: "Lip Sync", value: "lipsync" },
  { label: "Cinema", value: "cinema" },
  { label: "Workflows", value: "workflows" },
];

export function StudioTabs({ value, onChange }: { value: StudioTab; onChange: (v: StudioTab) => void }) {
  return <Segmented options={OPTIONS} value={value} onChange={onChange} size="md" />;
}
