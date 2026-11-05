import {
  Link,
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Body,
  Button,
  Card,
  Chip,
  ErrorText,
  Loading,
  useColors,
} from "@/components/ui";
import { api, type GroupDetail } from "@/core/api";
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

type Tab = "restaurants" | "home" | "routes";
const TABS: Tab[] = ["restaurants", "home", "routes"];
const TAB_LABEL: Record<Tab, string> = { restaurants: "food:restaurant.title", home: "food:dish.title", routes: "food:route.title" };
const TAB_KEY = "group_home_tab";

/** Group home. For a food group: saved restaurants and day routes (more tabs arrive with later milestones). */
export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
            style={{ flexDirection: "row", gap: 8 }}
          >
            {TABS.map((k) => (
              <Chip
                key={k}
                label={t(TAB_LABEL[k])}
                selected={tab === k}
                onPress={() => pickTab(k)}
              />
            ))}
          </View>
          {tab === "restaurants" ? (
            <RestaurantList groupId={id} restaurants={restaurants} />
          ) : tab === "home" ? (
            <DishList groupId={id} dishes={dishes} />
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
