import { V3Alert } from '../../ui/alert';

export function SkillReviewWarning({ warning }: { warning?: string | null }) {
  if (!warning) return null;
  return (
    <div className="sw-section">
      <V3Alert title="Skill review needed">{warning}</V3Alert>
    </div>
  );
}
