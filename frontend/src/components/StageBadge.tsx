import { stageColor, stageLabel } from "@/lib/format";
import type { ApplicationStage } from "@/api/types";

export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return <span className={`badge ${stageColor(stage)}`}>{stageLabel(stage)}</span>;
}
