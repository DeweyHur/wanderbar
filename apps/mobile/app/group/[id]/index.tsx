import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Body, Button, Card, Chip, ErrorText, Loading, useColors } from "@/components/ui";
import { api, type GroupDetail } from "@/core/api";
import { errorText } from "@/core/errors";
import { saveLastGroup } from "@/core/lastGroup";
import { getModule } from "@/core/modules/registry";
import { routeApi, type PlanSummary } from "@/modules/food/route/api";

/** Group home. For a food group: the day routes (more tabs arrive with later milestones). */
export default function GroupHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      saveLastGroup(id);
      Promise.all([api<GroupDetail>(`/api/groups/${id}`), routeApi.list(id)])
        .then(([g, p]) => {
          setGroup(g);
          setPlans(p);
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
            <Pressable accessibilityRole="button" hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: c.accent, fontSize: 16 }}>{t("common.settings")}</Text>
            </Pressable>
          </Link>
        ),
      }}
    />
  );

  if (!group || !plans)
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
      const date = new Intl.DateTimeFormat(i18n.language, { month: "long", day: "numeric" }).format(new Date());
      const plan = await routeApi.create(id, t("food:route.defaultTitle", { date }));
      router.push({ pathname: "/plan/[id]", params: { id: plan.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      {header}
      {!mod ? (
        <Body muted>{t("group.moduleUnavailable")}</Body>
      ) : (
        <>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>{t("food:route.title")}</Text>
          {plans.length === 0 && <Body muted>{t("food:route.empty")}</Body>}
          {plans.map((p) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })}>
              <Card>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: "600" }}>{p.title}</Text>
                <Body muted>
                  {t("food:route.progress", { finished: p.finished, total: p.total })}
                  {p.currentName ? ` · ${t("food:route.now", { name: p.currentName })}` : ""}
                </Body>
              </Card>
            </Pressable>
          ))}
          <Button label={t("food:route.new")} busy={creating} onPress={newPlan} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip label={t("food:share.title")} onPress={() => router.push("/share")} />
        <Chip label={t("food:route.members")} onPress={() => router.push({ pathname: "/group/[id]/members", params: { id } })} />
      </View>
    </ScrollView>
  );
}
