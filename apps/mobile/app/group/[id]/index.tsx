import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, View } from "react-native";
import { Body, Card, ErrorText, Loading, useColors, Text } from "@/components/ui";
import { useGroupLook } from "@/core/groupLook";
import { api, type GroupDetail, type GroupModuleId } from "@/core/api";
import { useSession } from "@/core/session";
import { GroupBar } from "@/components/GroupSwitcher";
import { BottomBar, type BarItem } from "@/components/BottomBar";
import { BoardGameHome } from "@/modules/boardgame/BoardGameHome";
import { FitnessHome } from "@/modules/fitness/FitnessHome";
import { RealEstateHome } from "@/modules/realestate/RealEstateHome";
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
import { FormScroll } from "@/components/FormScroll";

type Tab = "restaurants" | "home" | "routes" | "shopping";
const TABS: Tab[] = ["restaurants", "home", "routes", "shopping"];
const TAB_LABEL: Record<Tab, string> = { restaurants: "food:restaurant.title", home: "food:dish.title", routes: "food:route.title", shopping: "food:shopping.title" };
const TAB_SHORT: Record<Tab, string> = { restaurants: "food:tabs.restaurants", home: "food:tabs.home", routes: "food:tabs.routes", shopping: "food:tabs.shopping" };
const TAB_ICON: Record<Tab, BarItem["icon"]> = { restaurants: "restaurant-outline", home: "flame-outline", routes: "car-outline", shopping: "cart-outline" };
const TAB_KEY = "group_home_tab";

/** Group home: each module brings its own (food: restaurants, home cooking, routes; board game night). */
export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSession();
  const summary = state.status === "signedIn" ? state.groups.find((g) => g.id === id) : undefined;
  const known = summary?.module;
  // The group's theme and font dress the app while you're in it.
  useGroupLook(id);
  const [module, setModule] = useState<GroupModuleId | null>(known ?? null);
  useEffect(() => {
    if (known) setModule(known);
    // Not in the session yet (just joined, or a stale list): ask the server.
    else api<GroupDetail>(`/api/groups/${id}`).then((g) => setModule(g.module), () => setModule("food"));
  }, [id, known]);
  if (!module) return <Loading />;
  return module === "boardgame" ? <SimpleGroup id={id} body={<BoardGameHome groupId={id} />} /> : module === "fitness" ? <SimpleGroup id={id} body={<FitnessHome groupId={id} />} /> : module === "realestate" ? <SimpleGroup id={id} body={<RealEstateHome groupId={id} />} /> : <FoodHome id={id} />;
}

/** A group whose module draws its own home under the group bar (board game night, fitness, real estate). */
function SimpleGroup({ id, body }: { id: string; body: ReactNode }) {
  const { t } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const [name, setName] = useState("");
  const [more, setMore] = useState(false);
  useFocusEffect(
    useCallback(() => {
      saveLastGroup(id);
      api<GroupDetail>(`/api/groups/${id}`).then((g) => setName(g.name), () => {});
    }, [id]),
  );
  const unread = state.status === "signedIn" ? (state.groups.find((g) => g.id === id)?.unread ?? 0) : 0;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: name, headerTitle: () => null }} />
      <FormScroll testID="group-home" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <GroupBar groupId={id} />
        {more ? <GroupMenu id={id} /> : body}
      </FormScroll>
      <BottomBar
        items={[
          { key: "home", label: t("bar.home"), icon: "home-outline", selected: !more, onPress: () => setMore(false) },
          { key: "chat", label: t("bar.chat"), a11y: t("chat.open"), icon: "chatbubbles-outline", badge: unread, onPress: () => router.push({ pathname: "/group/[id]/chat", params: { id } }) },
          { key: "more", label: t("bar.more"), icon: "ellipsis-horizontal", selected: more, onPress: () => setMore(true) },
        ]}
      />
    </View>
  );
}

/** More: the group's people, its look, adding from a shared link (food) and the app's settings. */
function GroupMenu({ id, food }: { id: string; food?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const Row = ({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: 20, width: 28, textAlign: "center" }}>{icon}</Text>
      <Text style={{ color: c.text, fontSize: 17, flex: 1 }}>{label.replace(/^\p{Extended_Pictographic}\s*/u, "")}</Text>
      <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
  return (
    <Card testID="group-menu">
      <Row icon="👥" label={t("food:route.members")} onPress={() => router.push({ pathname: "/group/[id]/members", params: { id } })} />
      <Row icon="🎨" label={t("group.look")} onPress={() => router.push({ pathname: "/group/[id]/look", params: { id } })} />
      {food && <Row icon="🔗" label={t("food:share.title")} onPress={() => router.push("/share")} />}
      <Row icon="⚙️" label={t("common.settings")} onPress={() => router.push("/settings")} />
    </Card>
  );
}

/** Food group: saved restaurants, home cooking, day routes and the shopping list. */
function FoodHome({ id }: { id: string }) {
  const { t } = useTranslation();
  const c = useColors();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[] | null>(
    null,
  );
  const [tab, setTab] = useState<Tab | "more">("routes");
  const [error, setError] = useState("");
  const [dishes, setDishes] = useState<DishSummary[] | null>(null);

  useEffect(() => {
    prefs
      .get(TAB_KEY)
      .then((v) => TABS.includes(v as Tab) && setTab(v as Tab));
  }, []);
  const pickTab = (next: Tab | "more") => {
    setTab(next);
    if (next !== "more") prefs.set(TAB_KEY, next);
  };

  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    () =>
      Promise.all([api<GroupDetail>(`/api/groups/${id}`), routeApi.list(id), restaurantApi.list(id), dishApi.list(id)])
        .then(([g, p, r, d]) => {
          setGroup(g);
          setPlans(p);
          setRestaurants(r);
          setDishes(d);
          setError("");
        })
        .catch((e) => setError(errorText(t, e))),
    [id, t],
  );
  useFocusEffect(
    useCallback(() => {
      saveLastGroup(id);
      load();
    }, [id, load]),
  );
  // Pull down to fetch what others added meanwhile.
  const refresh = () => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  const header = (
    <Stack.Screen
      options={{
        title: group?.name ?? "",
        headerTitle: () => null,
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
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FormScroll
        testID="group-home"
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ padding: 20, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} colors={[c.accent]} />}
      >
        {header}
        <GroupBar groupId={id} />
        {!mod ? (
          <Body muted>{t("group.moduleUnavailable")}</Body>
        ) : tab === "more" ? (
          <GroupMenu id={id} food />
        ) : tab === "restaurants" ? (
          <RestaurantList groupId={id} restaurants={restaurants} />
        ) : tab === "home" ? (
          <DishList groupId={id} dishes={dishes} />
        ) : tab === "shopping" ? (
          <ShoppingList groupId={id} dishes={dishes} />
        ) : (
          <RouteList groupId={id} plans={plans} />
        )}
        <ErrorText>{error}</ErrorText>
      </FormScroll>
      <BottomBar
        items={[
          ...TABS.map((k) => ({ key: k, label: t(TAB_SHORT[k]), a11y: t(TAB_LABEL[k]), icon: TAB_ICON[k], selected: tab === k, onPress: () => pickTab(k) })),
          { key: "more", label: t("bar.more"), icon: "ellipsis-horizontal" as const, selected: tab === "more", onPress: () => pickTab("more") },
        ]}
      />
    </View>
  );
}
