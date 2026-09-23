import { PencilSquare, Trash } from "@medusajs/icons";
import {
  Button,
  Container,
  Heading,
  StatusBadge,
  toast,
  usePrompt,
} from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { DisplayExtensionZone, DisplayField } from "@mercurjs/dashboard-shared";

import { ActionMenu } from "@components/common/action-menu";
import { SectionRow } from "@components/common/section";
import {
  useDeleteProduct,
  useSubmitProductForReview,
} from "@hooks/api/products";
import { canSubmitForReview, isQueuedForReview } from "@lib/product-change";

const GENERAL_FIELD_IDS = [
  "title",
  "status",
  "description",
  "subtitle",
  "handle",
  "discountable",
];

export const productStatusColor = (status: string) => {
  switch (status) {
    case "draft":
      return "grey";
    case "proposed":
      return "orange";
    case "published":
      return "green";
    case "rejected":
      return "red";
    default:
      return "grey";
  }
};

export const ProductGeneralSection = ({
  product,
}: {
  product: Record<string, any>;
}) => {
  const { t } = useTranslation();
  const prompt = usePrompt();
  const navigate = useNavigate();

  const { mutateAsync } = useDeleteProduct(product.id);
  const { mutateAsync: submitForReview, isPending: isSubmitting } =
    useSubmitProductForReview(product.id);

  const handleSubmitForReview = async () => {
    const confirmed = await prompt({
      title: t("products.submitForReview.title"),
      description: t("products.submitForReview.description", {
        title: product.title,
      }),
      confirmText: t("products.submitForReview.action"),
      cancelText: t("actions.cancel"),
    });

    if (!confirmed) {
      return;
    }

    await submitForReview(undefined, {
      onSuccess: ({ product: submitted }) => {
        toast.success(
          t(
            submitted?.status === "published"
              ? "products.submitForReview.publishedToast"
              : "products.submitForReview.successToast",
            { title: product.title },
          ),
        );
      },
      onError: (e) => {
        toast.error(e.message);
      },
    }).catch(() => undefined);
  };

  const handleDelete = async () => {
    const res = await prompt({
      title: t("general.areYouSure"),
      description: t("products.deleteWarning", {
        title: product.title,
      }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
    });

    if (!res) {
      return;
    }

    await mutateAsync(undefined, {
      onSuccess: (response) => {
        if (isQueuedForReview(response)) {
          // A published product stays until an operator approves the delete.
          toast.success(t("products.toasts.delete.requested.header"), {
            description: t("products.toasts.delete.requested.description", {
              title: product.title,
            }),
          });
          return;
        }

        toast.success(t("products.toasts.delete.success.header"), {
          description: t("products.toasts.delete.success.description", {
            title: product.title,
          }),
        });
        navigate("..");
      },
      onError: (e) => {
        toast.error(t("products.toasts.delete.error.header"), {
          description: e.message,
        });
      },
      // The error is shown above; without this the rejection escaped the
      // click handler as an uncaught promise.
    }).catch(() => undefined);
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <DisplayField model="product" zone="general" id="title" data={product}>
          <Heading>{product.title}</Heading>
        </DisplayField>
        <div className="flex items-center gap-x-4">
          {canSubmitForReview(product.status) && (
            <Button
              size="small"
              variant="secondary"
              onClick={handleSubmitForReview}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              data-testid="product-submit-for-review-button"
            >
              {t("products.submitForReview.action")}
            </Button>
          )}
          <DisplayField
            model="product"
            zone="general"
            id="status"
            data={product}
          >
            <StatusBadge color={productStatusColor(product.status)}>
              {t(`products.productStatus.${product.status}`)}
            </StatusBadge>
          </DisplayField>
          <ActionMenu
            groups={[
              {
                actions: [
                  {
                    label: t("actions.edit"),
                    to: "edit",
                    icon: <PencilSquare />,
                  },
                ],
              },
              {
                actions: [
                  {
                    label: t("actions.delete"),
                    onClick: handleDelete,
                    icon: <Trash />,
                  },
                ],
              },
            ]}
          />
        </div>
      </div>

      <DisplayField model="product" zone="general" id="description" data={product}>
        <SectionRow
          title={t("fields.description")}
          value={product.description || "-"}
        />
      </DisplayField>
      <DisplayField model="product" zone="general" id="subtitle" data={product}>
        <SectionRow
          title={t("fields.subtitle")}
          value={product.subtitle || "-"}
        />
      </DisplayField>
      <DisplayField model="product" zone="general" id="handle" data={product}>
        <SectionRow title={t("fields.handle")} value={`/${product.handle}`} />
      </DisplayField>
      <DisplayField
        model="product"
        zone="general"
        id="discountable"
        data={product}
      >
        <SectionRow
          title={t("fields.discountable")}
          value={product.discountable ? t("general.true") : t("general.false")}
        />
      </DisplayField>
      <DisplayExtensionZone
        model="product"
        zone="general"
        data={product}
        builtInFieldIds={GENERAL_FIELD_IDS}
      />
    </Container>
  );
};
