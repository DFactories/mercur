import {
  BuildingStorefront,
  Buildings,
  CogSixTooth,
  CreditCardRefresh,
  CurrencyDollar,
  EllipsisHorizontal,
  MagnifyingGlass,
  MinusMini,
  OpenRectArrowOut,
  ReceiptPercent,
  ShoppingCart,
  Tag,
  Users,
} from "@medusajs/icons";
import components from "virtual:mercur/components";
import {
  Avatar,
  Divider,
  DropdownMenu,
  IconButton,
  Text,
  clx,
} from "@medusajs/ui";

import { Collapsible as RadixCollapsible } from "radix-ui";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useLogout } from "../../../hooks/api";
import { useStore } from "../../../hooks/api/store";
import { useDocumentDirection } from "../../../hooks/use-document-direction";
import { queryClient } from "../../../lib/query-client";
import { useSearch } from "../../../providers/search-provider";
import { Skeleton } from "../../common/skeleton";
import { INavItem, NavItem } from "../../layout/nav-item";
import { Shell } from "../../layout/shell";
import { UserMenu } from "../user-menu";
import menuItemsModule from "virtual:mercur/menu-items";
import {
  applyNavOverrides,
  useExtension,
  type CoreNavItem,
} from "@mercurjs/dashboard-shared";

const navId = (to: string) => to.replace(/^\//, "");

const toCoreNavItem = (route: Omit<INavItem, "pathname">): CoreNavItem => ({
  id: navId(route.to),
  label: route.label,
  to: route.to,
  icon: route.icon,
  items: route.items?.map((item) => ({
    id: navId(item.to),
    label: item.label,
    to: item.to,
  })),
});
import { getMenuItemsByType, getNestedMenuItems } from "../../../utils/routes";

export const MainLayout = () => {
  const Sidebar = components.MainSidebar ? components.MainSidebar : MainSidebar;
  return (
    <Shell>
      <Sidebar />
    </Shell>
  );
};

const allMenuItems = menuItemsModule.menuItems ?? [];

const addNestedItems = (
  to: string,
  items?: { label: string; to: string; translationNs?: string }[],
) => {
  const nestedItems = getNestedMenuItems(allMenuItems, to);
  if (nestedItems.length === 0) {
    return items;
  }

  const nestedNavItems = nestedItems.map((item) => ({
    label: item.label,
    to: item.path,
    translationNs: item.translationNs,
  }));

  return [...(items ?? []), ...nestedNavItems];
};

const MainSidebar = () => {
  const { t } = useTranslation();
  const coreRoutes = useCoreRoutes();
  const navOverrides = useExtension().getNavOverrides();
  const customMenuItems = getMenuItemsByType(allMenuItems, "main");

  const routesWithNested = applyNavOverrides(
    coreRoutes.map(toCoreNavItem),
    navOverrides,
  ).map((route) => ({
    ...route,
    items: addNestedItems(route.to, route.items),
  }));

  const customRoutesWithNested = customMenuItems
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((item) => ({
      label: item.label,
      to: item.path,
      icon: item.icon ? <item.icon /> : undefined,
      translationNs: item.translationNs,
      items: addNestedItems(item.path),
    }));

  return (
    <aside
      className="flex flex-1 flex-col justify-between overflow-y-auto"
      data-testid="sidebar"
    >
      <div className="flex flex-1 flex-col">
        <div
          className="sticky top-0 bg-ui-bg-subtle"
          data-testid="sidebar-header-section"
        >
          <Header />
          <div className="px-3">
            <Divider variant="dashed" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-between">
          <div className="flex flex-1 flex-col">
            <nav
              className="flex flex-col gap-y-1 py-3"
              data-testid="sidebar-core-routes"
            >
              <Searchbar />
              {routesWithNested.map((route) => {
                return <NavItem key={route.to} {...route} />;
              })}
            </nav>
            {customRoutesWithNested.length > 0 && (
              <>
                <div className="px-3">
                  <Divider variant="dashed" />
                </div>
                <AdvancedSection
                  label={t("app.nav.common.advanced")}
                  items={customRoutesWithNested}
                />
              </>
            )}
          </div>
          <UtilitySection />
        </div>
        <div
          className="sticky bottom-0 bg-ui-bg-subtle"
          data-testid="sidebar-user-section"
        >
          <UserSection />
        </div>
      </div>
    </aside>
  );
};

/**
 * Routes this installation added, under a heading of their own.
 *
 * They used to sit directly under the platform's own routes with nothing
 * separating them, so the sidebar read as one list in which half the entries
 * came from somewhere else. This is the same shape the settings sidebar
 * already uses for its sections, collapsible included, so the two navigations
 * stay recognisably the same thing.
 */
const AdvancedSection = ({
  label,
  items,
}: {
  label: string;
  items: INavItem[];
}) => {
  return (
    <RadixCollapsible.Root
      defaultOpen
      className="py-3"
      data-testid="sidebar-advanced-routes"
    >
      <div className="px-3">
        <div className="flex h-7 items-center justify-between px-2 text-ui-fg-muted">
          <Text size="small" leading="compact">
            {label}
          </Text>
          <RadixCollapsible.Trigger asChild>
            <IconButton size="2xsmall" variant="transparent" className="static">
              <MinusMini className="text-ui-fg-muted" />
            </IconButton>
          </RadixCollapsible.Trigger>
        </div>
      </div>
      <RadixCollapsible.Content>
        <nav className="flex flex-col gap-y-1 pt-0.5">
          {items.map((route) => (
            <NavItem key={route.to} {...route} />
          ))}
        </nav>
      </RadixCollapsible.Content>
    </RadixCollapsible.Root>
  );
};

const Logout = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { mutateAsync: logoutMutation } = useLogout();

  /**
   * A 401 from DELETE /auth/session means the session is already gone — the
   * goal state, not a failure — so logout must still complete locally.
   * Navigate out of the protected tree BEFORE clearing the cache, or every
   * mounted `useMe` observer refetches against the destroyed session and the
   * resulting 401s hit the error boundary.
   */
  const handleLogout = async () => {
    try {
      await logoutMutation();
    } catch {
      // Session already invalid server-side; local cleanup still runs.
    }

    navigate("/login", { replace: true });
    queryClient.clear();
  };

  return (
    <DropdownMenu.Item
      onClick={handleLogout}
      data-testid="sidebar-header-dropdown-logout"
    >
      <div className="flex items-center gap-x-2">
        <OpenRectArrowOut className="text-ui-fg-subtle" />
        <span>{t("app.menus.actions.logout")}</span>
      </div>
    </DropdownMenu.Item>
  );
};

const Header = () => {
  const { t } = useTranslation();
  const { store, isPending, isError, error } = useStore();
  const direction = useDocumentDirection();
  const name = store?.name;
  const fallback = store?.name?.slice(0, 1).toUpperCase();

  const isLoaded = !isPending && !!store && !!name && !!fallback;

  if (isError) {
    throw error;
  }

  return (
    <div className="w-full p-3" data-testid="sidebar-header-dropdown">
      <DropdownMenu dir={direction} data-testid="sidebar-header-dropdown-menu">
        <DropdownMenu.Trigger
          disabled={!isLoaded}
          className={clx(
            "grid w-full grid-cols-[24px_1fr_15px] items-center gap-x-3 rounded-md bg-ui-bg-subtle p-0.5 pe-2 outline-none transition-fg",
            "hover:bg-ui-bg-subtle-hover",
            "data-[state=open]:bg-ui-bg-subtle-hover",
            "focus-visible:shadow-borders-focus",
          )}
          data-testid="sidebar-header-dropdown-trigger"
        >
          {fallback ? (
            <Avatar
              variant="squared"
              size="xsmall"
              fallback={fallback}
              data-testid="sidebar-header-dropdown-avatar"
            />
          ) : (
            <Skeleton className="h-6 w-6 rounded-md" />
          )}
          <div
            className="block overflow-hidden text-start"
            data-testid="sidebar-header-dropdown-store-name"
          >
            {name ? (
              <Text
                size="small"
                weight="plus"
                leading="compact"
                className="truncate"
              >
                {store.name}
              </Text>
            ) : (
              <Skeleton className="h-[9px] w-[120px]" />
            )}
          </div>
          <EllipsisHorizontal className="text-ui-fg-muted" />
        </DropdownMenu.Trigger>
        {isLoaded && (
          <DropdownMenu.Content
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0"
            data-testid="sidebar-header-dropdown-content"
          >
            <div
              className="flex items-center gap-x-3 px-2 py-1"
              data-testid="sidebar-header-dropdown-user-info"
            >
              <Avatar
                variant="squared"
                size="small"
                fallback={fallback}
                data-testid="sidebar-header-dropdown-user-avatar"
              />
              <div
                className="flex flex-col overflow-hidden"
                data-testid="sidebar-header-dropdown-user-details"
              >
                <Text
                  size="small"
                  weight="plus"
                  leading="compact"
                  className="truncate"
                  data-testid="sidebar-header-dropdown-user-name"
                >
                  {name}
                </Text>
                <Text
                  size="xsmall"
                  leading="compact"
                  className="text-ui-fg-subtle"
                  data-testid="sidebar-header-dropdown-store-label"
                >
                  {t("app.nav.main.marketplace")}
                </Text>
              </div>
            </div>
            <DropdownMenu.Separator data-testid="sidebar-header-dropdown-separator-1" />
            <DropdownMenu.Item
              className="gap-x-2"
              asChild
              data-testid="sidebar-header-dropdown-store-settings"
            >
              <Link to="/settings/marketplace">
                <BuildingStorefront className="text-ui-fg-subtle" />
                {t("app.nav.main.marketplaceSettings")}
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator data-testid="sidebar-header-dropdown-separator-2" />
            <Logout />
          </DropdownMenu.Content>
        )}
      </DropdownMenu>
    </div>
  );
};

const useCoreRoutes = (): Omit<INavItem, "pathname">[] => {
  const { t } = useTranslation();

  return [
    {
      icon: <ShoppingCart />,
      label: t("orders.domain"),
      to: "/orders",
      items: [
        // TODO: Enable when domin is introduced
        // {
        //   label: t("draftOrders.domain"),
        //   to: "/draft-orders",
        // },
      ],
    },
    {
      icon: <Tag />,
      label: t("products.domain"),
      to: "/products",
      items: [
        {
          label: t("offers.domain"),
          to: "/offers",
        },
        {
          label: t("collections.domain"),
          to: "/collections",
        },
        {
          label: t("categories.domain"),
          to: "/categories",
        },
        // TODO: Enable when domin is introduced
        // {
        //   label: t("giftCards.domain"),
        //   to: "/gift-cards",
        // },
      ],
    },
    {
      icon: <Buildings />,
      label: t("inventory.domain"),
      to: "/inventory",
      items: [
        {
          label: t("reservations.domain"),
          to: "/reservations",
        },
      ],
    },
    {
      icon: <Users />,
      label: t("customers.domain"),
      to: "/customers",
      items: [
        {
          label: t("customerGroups.domain"),
          to: "/customer-groups",
        },
      ],
    },
    {
      icon: <ReceiptPercent />,
      label: t("promotions.domain"),
      to: "/promotions",
      items: [
        {
          label: t("campaigns.domain"),
          to: "/campaigns",
        },
      ],
    },
    {
      icon: <CurrencyDollar />,
      label: t("priceLists.domain"),
      to: "/price-lists",
    },
    {
      icon: <BuildingStorefront />,
      label: t("stores.domain"),
      to: "/stores",
    },
    {
      icon: <CreditCardRefresh />,
      label: t("payouts.domain"),
      to: "/payouts",
    },
  ];
};

const Searchbar = () => {
  const { t } = useTranslation();
  const { toggleSearch } = useSearch();

  return (
    <div className="px-3" data-testid="sidebar-search">
      <button
        onClick={toggleSearch}
        className={clx(
          "flex w-full items-center gap-x-2.5 rounded-md bg-ui-bg-subtle px-2 py-1 text-ui-fg-subtle outline-none",
          "hover:bg-ui-bg-subtle-hover",
          "focus-visible:shadow-borders-focus",
        )}
        data-testid="sidebar-search-button"
      >
        <MagnifyingGlass />
        <div className="flex-1 text-start">
          <Text size="small" leading="compact" weight="plus">
            {t("app.search.label")}
          </Text>
        </div>
        <Text size="small" leading="compact" className="text-ui-fg-muted">
          ⌘K
        </Text>
      </button>
    </div>
  );
};

const UtilitySection = () => {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-y-0.5 py-3">
      <NavItem
        label={t("app.nav.settings.header")}
        to="/settings"
        from={location.pathname}
        icon={<CogSixTooth />}
      />
    </div>
  );
};

const UserSection = () => {
  return (
    <div>
      <div className="px-3">
        <Divider variant="dashed" />
      </div>
      <UserMenu />
    </div>
  );
};
