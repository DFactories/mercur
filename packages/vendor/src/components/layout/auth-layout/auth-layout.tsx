import { ReactNode } from "react";

// DFACTORIES: animated hero aside replaces the static onboarding illustration.
import { AuthHero } from "../auth-hero";

type AuthLayoutProps = {
  children: ReactNode;
};

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex h-dvh w-dvw overflow-hidden">
      <div className="bg-ui-bg-base border-ui-border-base flex h-full w-full flex-col overflow-y-auto border-r lg:w-[584px] lg:shrink-0">
        {/* DFACTORIES: center the form column vertically on tablet+ (66px gap). */}
        <div className="flex flex-1 flex-col p-8 md:justify-center md:py-[66px] lg:px-14">
          {children}
        </div>
      </div>
      {/* DFACTORIES: was a static `div[bg.svg] > img` panel. */}
      <AuthHero />
    </div>
  );
};
