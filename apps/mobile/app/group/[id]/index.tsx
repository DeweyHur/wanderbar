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

type Tab = "restaurants" | "routes";
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
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    prefs
      .get(TAB_KEY)
      .then((v) => (v === "restaurants" || v === "routes") && setTab(v));
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
      ])
        .then(([g, p, r]) => {
          setGroup(g);
          setPlans(p);
          setRestaurants(r);
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

  if (!group || !plans || !restaurants)
    return error ? (
      <View style={{ flex: 1, padding: 20, backgroundColor: c.bg }}>
        {header}
        <ErrorText>{error}</ErrorText>
      </View>
    ) : (
      <Loading />
    );

  const mod = getModule(group.module);
  const newPlan = async () => {
    setCreating(true);
    try {
      const date = new Intl.DateTimeFormat(i18n.language, {
        month: "long",
        day: "numeric",
      }).format(new Date());
      const plan = await routeApi.create(
        id,
        t("food:route.defaultTitle", { date }),
      );
      router.push({ pathname: "/plan/[id]", params: { id: plan.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setCreating(false);
    }
  };

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
            {(["restaurants", "routes"] as const).map((k) => (
              <Chip
                key={k}
                label={t(
                  k === "routes" ? "food:route.title" : "food:restaurant.title",
                )}
                selected={tab === k}
                onPress={() => pickTab(k)}
              />
            ))}
          </View>
          {tab === "restaurants" ? (
            <RestaurantList groupId={id} restaurants={restaurants} />
          ) : (
            <>
              {plans.length === 0 && <Body muted>{t("food:route.empty")}</Body>}
              {plans.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() =>
                    router.push({
                      pathname: "/plan/[id]",
                      params: { id: p.id },
                    })
                  }
                >
                  <Card>
                    <Text
                      style={{ color: c.text, fontSize: 17, fontWeight: "600" }}
                    >
                      {p.title}
                    </Text>
                    <Body muted>
                      {t("food:route.progress", {
                        finished: p.finished,
                        total: p.total,
                      })}
                      {p.currentName
                        ? ` · ${t("food:route.now", { name: p.currentName })}`
                        : ""}
                    </Body>
                  </Card>
                </Pressable>
              ))}
              <Button
                label={t("food:route.new")}
                busy={creating}
                onPress={newPlan}
              />
            </>
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
