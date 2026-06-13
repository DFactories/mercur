import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { OnboardingWizard } from "@components/onboarding-wizard";

const ONBOARDING_EMAIL_KEY = "mercur_onboarding_email";
const ONBOARDING_PHONE_KEY = "mercur_onboarding_phone";

export const Onboarding = () => {
  const location = useLocation();
  const state = location.state as { email?: string; phone?: string } | null;
  const stateEmail = state?.email;
  const statePhone = state?.phone;

  // Persist identity to sessionStorage for refresh resilience
  useEffect(() => {
    if (stateEmail) {
      sessionStorage.setItem(ONBOARDING_EMAIL_KEY, stateEmail);
    }
    if (statePhone) {
      sessionStorage.setItem(ONBOARDING_PHONE_KEY, statePhone);
    }
  }, [stateEmail, statePhone]);

  const email =
    stateEmail || sessionStorage.getItem(ONBOARDING_EMAIL_KEY) || "";
  const phone =
    statePhone || sessionStorage.getItem(ONBOARDING_PHONE_KEY) || "";

  if (!email && !phone) {
    return <Navigate to="/login" replace />;
  }

  return (
    <OnboardingWizard
      memberEmail={email || undefined}
      memberPhone={phone || undefined}
    />
  );
};
