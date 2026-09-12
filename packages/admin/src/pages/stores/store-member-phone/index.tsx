import { Heading } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import { useParams, useSearchParams } from "react-router-dom";

import { RouteDrawer } from "../../../components/modals";
import { MemberPhoneForm } from "./components/member-phone-form";

/**
 * The drawer that recovers a locked-out producer: it edits the member's
 * SIGN-IN number, not the store's contact number (that one lives on the store
 * form). The current value rides in on the query string — the row the operator
 * clicked already has it, and a lookup would only add a request and a spinner.
 */
const Root = () => {
  const { t } = useTranslation();
  const { member_id: memberId } = useParams();
  const [searchParams] = useSearchParams();

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <Heading>{t("stores.members.phone.header")}</Heading>
      </RouteDrawer.Header>
      {memberId ? (
        <MemberPhoneForm
          memberId={memberId}
          currentPhone={searchParams.get("phone")}
        />
      ) : null}
    </RouteDrawer>
  );
};

export const Component = Root;
