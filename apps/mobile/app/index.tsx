import { getLocales } from "expo-localization";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SignIn } from "@/components/SignIn";
import { Button, ErrorText, Loading, Screen } from "@/components/ui";
import { api, type GroupSummary } from "@/core/api";
import { errorText } from "@/core/errors";
import { isLanguage } from "@/core/i18n";
import { loadLastGroup } from "@/core/lastGroup";
import { useSession } from "@/core/session";

export default function Home() {
  const { state } = useSession();
  if (state.status === "loading") return <Loading />;
  if (state.status === "signedOut") return <SignIn />;
  if (state.groups.length === 0) return <CreatePersonalGroup />;
  return <OpenGroup groups={state.groups} />;
}

/** Opens the group used last time (several groups are possible once someone is invited elsewhere). */
function OpenGroup({ groups }: { groups: GroupSummary[] }) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    loadLastGroup().then((last) => setId(last && groups.some((g) => g.id === last) ? last : groups[0].id));
  }, [groups]);
  if (!id) return <Loading />;
  return <Redirect href={{ pathname: "/group/[id]", params: { id } }} />;
}

/**
 * Works solo from the first sign-in: a personal food group is created automatically in the user's
 * language, time zone and currency; inviting others is optional. (Someone who arrives through an
 * invite link joins that group instead and never sees this.)
 */
function CreatePersonalGroup() {
  const { t, i18n } = useTranslation();
  const { refresh, signOut } = useSession();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const locale = getLocales()[0];
    const body = {
      name: t("group.personalName"),
      module: "food",
      defaultLocale: isLanguage(i18n.language) ? i18n.language : "en",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      currency: locale?.currencyCode ?? "USD",
    };
    (async () => {
      try {
        await api<GroupSummary>("/api/groups", { body });
        if (!cancelled) await refresh();
      } catch (e) {
        if (!cancelled) setError(errorText(t, e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per attempt; language changes mid-flight shouldn't create a second group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (!error) return <Loading />;
  return (
    <Screen>
      <ErrorText>{error}</ErrorText>
      <Button
        label={t("common.retry")}
        onPress={() => {
          setError("");
          setAttempt((n) => n + 1);
        }}
      />
      <Button kind="plain" label={t("common.signOut")} onPress={signOut} />
    </Screen>
  );
}
