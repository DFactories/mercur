import { Trans } from "react-i18next";

// DFACTORIES (isolated): legal consent line shown under the login / register
// forms. Links go to the storefront Terms and Privacy pages. The wording is
// i18n-driven (en + fa) and page-specific via `i18nKey`.
//
// `__STOREFRONT_URL__` is a build-time global injected by the consuming app's
// Vite config (env-driven: localhost:3000 in dev, https://dfactories.com in
// prod). `typeof` guard keeps it safe if a consumer doesn't define it (links
// fall back to same-origin relative paths).
declare const __STOREFRONT_URL__: string;

const STOREFRONT_BASE =
  typeof __STOREFRONT_URL__ !== "undefined" ? __STOREFRONT_URL__ : "";

const linkClass =
  "text-ui-fg-interactive transition-fg hover:text-ui-fg-interactive-hover focus-visible:text-ui-fg-interactive-hover font-medium outline-none";

export const AuthConsent = ({ i18nKey }: { i18nKey: string }) => {
  return (
    <p className="text-ui-fg-muted mt-6 text-center text-[0.7rem] leading-5">
      <Trans
        i18nKey={i18nKey}
        components={[
          // Fallback children are replaced by the matching segment of the i18n
          // string at runtime; they keep the anchors a11y-valid for the linter.
          <a
            key="terms"
            href={`${STOREFRONT_BASE}/terms-and-conditions`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            terms
          </a>,
          <a
            key="privacy"
            href={`${STOREFRONT_BASE}/privacy-policy`}
            target="_blank"
            rel="noreferrer"
            className={linkClass}
          >
            privacy
          </a>,
        ]}
      />
    </p>
  );
};
