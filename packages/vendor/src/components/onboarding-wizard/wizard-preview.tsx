// DFACTORIES: the static per-step illustration is replaced by the animated
// hero aside, which renders the onboarding steps as a live pill row + progress.
import { AuthHero } from "../layout/auth-hero";

type WizardPreviewProps = {
  currentStep: number;
};

export const WizardPreview = ({ currentStep }: WizardPreviewProps) => {
  return <AuthHero variant="onboarding" currentStep={currentStep} />;
};
