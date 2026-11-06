import {
  Link,
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, isThemeId, Loading, useColors, useTheme, Text } from "@/components/ui";
import { api, type GroupDetail, type GroupModuleId } from "@/core/api";
import { useSession } from "@/core/session";
import { GroupTitle } from "@/components/GroupSwitcher";
import { BoardGameHome } from "@/modules/boardgame/BoardGameHome";
import { errorText } from "@/core/errors";
import { saveLastGroup } from "@/core/lastGroup";
import { getModule } from "@/core/modules/registry";
import { prefs } from "@/core/platform/prefs";
import {
  restaurantApi,
  type RestaurantSummary,
} from "@/modules/food/restaurants/api";
import { RestaurantList } from "@/modules/food/restaurants/RestaurantList";
import { routeApi, type PlanSummary } from "@/modules/food/route/api";
import { RouteList } from "@/modules/food/route/RouteList";
import { dishApi, type DishSummary } from "@/modules/food/dishes/api";
import { DishList } from "@/modules/food/dishes/DishList";
import { ShoppingList } from "@/modules/food/shopping/ShoppingList";

type Tab = "restaurants" | "home" | "routes" | "shopping";
const TABS: Tab[] = ["restaurants", "home", "routes", "shopping"];
const TAB_LABEL: Record<Tab, string> = { restaurants: "food:restaurant.title", home: "food:dish.title", routes: "food:route.title", shopping: "food:shopping.title" };
const TAB_ICON: Record<Tab, string> = { restaurants: "🍜", home: "🍳", routes: "🚗", shopping: "🛒" };
const TAB_KEY = "group_home_tab";

/** Group home: each module brings its own (food: restaurants, home cooking, routes; board game night). */
export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSession();
  const summary = state.status === "signedIn" ? state.groups.find((g) => g.id === id) : undefined;
  const known = summary?.module;
  // The group's color theme colors the app while you're in it.
  const { setThemeId } = useTheme();
  const theme = summary?.theme;
  useFocusEffect(
    useCallback(() => {
      if (summary) setThemeId(isThemeId(theme) ? theme : "pink");
    }, [summary, theme, setThemeId]),
  );
  const [module, setModule] = useState<GroupModuleId | null>(known ?? null);
  useEffect(() => {
    if (known) setModule(known);
    // Not in the session yet (just joined, or a stale list): ask the server.
    else api<GroupDetail>(`/api/groups/${id}`).then((g) => setModule(g.module), () => setModule("food"));
  }, [id, known]);
  if (!module) return <Loading />;
  return module === "boardgame" ? <BoardGameGroup id={id} /> : <FoodHome id={id} />;
}

function BoardGameGroup({ id }: { id: string }) {
  const { t } = useTranslation();
  const c = useColors();
  const [name, setName] = useState("");
  useFocusEffect(
    useCallback(() => {
      saveLastGroup(id);
      api<GroupDetail>(`/api/groups/${id}`).then((g) => setName(g.name), () => {});
    }, [id]),
  );
  return (
    <ScrollView testID="group-home" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name, headerTitle: () => <GroupTitle name={name} />, headerRight: () => <SettingsLink /> }} />
      <BoardGameHome groupId={id} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t("food:route.members")} onPress={() => router.push({ pathname: "/group/[id]/members", params: { id } })} />
      </View>
    </ScrollView>
  );
}

function SettingsLink() {
  const { t } = useTranslation();
  const c = useColors();
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityRole="button" hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
        <Text style={{ color: c.accent, fontSize: 16 }}>{t("common.settings")}</Text>
      </Pressable>
    </Link>
  );
}

/** Food group: saved restaurants, home cooking, day routes and the shopping list. */
function FoodHome({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[] | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>("routes");
  const [error, setError] = useState("");
  const [dishes, setDishes] = useState<DishSummary[] | null>(null);

  useEffect(() => {
    prefs
      .get(TAB_KEY)
      .then((v) => TABS.includes(v as Tab) && setTab(v as Tab));
  }, []);
  const pickTab = (next: Tab) => {
    setTab(next);
    prefs.set(TAB_KEY, next);
  };

  useFocusEffect(
    useCallback(() => {
      saveLastGroup(id);
      Promise.all([
        api<GroupDetail>(`/api/groups/${id}`),
        routeApi.list(id),
        restaurantApi.list(id),
        dishApi.list(id),
      ])
        .then(([g, p, r, d]) => {
          setGroup(g);
          setPlans(p);
          setRestaurants(r);
          setDishes(d);
          setError("");
        })
        .catch((e) => setError(errorText(t, e)));
    }, [id, t]),
  );

  const header = (
    <Stack.Screen
      options={{
        title: group?.name ?? "",
        headerTitle: () => <GroupTitle name={group?.name ?? ""} />,
        headerRight: () => (
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              style={{ paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: c.accent, fontSize: 16 }}>
                {t("common.settings")}
              </Text>
            </Pressable>
          </Link>
        ),
      }}
    />
  );

  if (!group || !plans || !restaurants || !dishes)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        {header}
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const mod = getModule(group.module);
  return (
    <ScrollView
      testID="group-home"
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 20, gap: 14 }}
    >
      {header}
      {!mod ? (
        <Body muted>{t("group.moduleUnavailable")}</Body>
      ) : (
        <>
          <View
            accessibilityRole="tablist"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
          >
            {TABS.map((k) => (
              <Chip
                key={k}
                label={t(TAB_LABEL[k])}
                icon={TAB_ICON[k]}
                selected={tab === k}
                onPress={() => pickTab(k)}
              />
            ))}
          </View>
          {tab === "restaurants" ? (
            <RestaurantList groupId={id} restaurants={restaurants} />
          ) : tab === "home" ? (
            <DishList groupId={id} dishes={dishes} />
          ) : tab === "shopping" ? (
            <ShoppingList groupId={id} dishes={dishes} />
          ) : (
            <RouteList groupId={id} plans={plans} />
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip
          label={t("food:share.title")}
          onPress={() => router.push("/share")}
        />
        <Chip
          label={t("food:route.members")}
          onPress={() =>
            router.push({ pathname: "/group/[id]/members", params: { id } })
          }
        />
      </View>
    </ScrollView>
  );
}
