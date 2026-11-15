import { CHECK_KEYS, QUICK, ROOMS, SCORE_KEYS, type Room } from "@wanderbar/route";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Chip, ErrorText, Field, Loading, Text, useColors } from "@/components/ui";
import { apiImage } from "@/core/api";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { pickPhotos } from "@/core/platform/photos";
import { photoApi, type Photo } from "@/core/photos/api";
import { reApi, type TourDetail, type TourEdit } from "@/modules/realestate/api";
import { CheckChip, Dots, Scale10, SectionTitle } from "@/modules/realestate/parts";

/**
 * One visit, made for walking through the house: pick a room → photos and a note; tap scores and
 * checks; then the overall score, likes and concerns once outside.
 */
export default function TourScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const c = useColors();
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [draft, setDraft] = useState<TourDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [room, setRoom] = useState<Room>("exterior");
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadPhotos = useCallback((propertyId: string) => {
    photoApi.list(propertyId).then((ps) => setPhotos(ps.filter((p) => p.tourId === id)), () => {});
  }, [id]);
  useEffect(() => {
    reApi.tour(id).then(
      (x) => {
        setTour(x);
        setDraft(x);
        loadPhotos(x.propertyId);
      },
      (e) => setError(errorText(t, e)),
    );
  }, [id, t, loadPhotos]);

  if (!tour || !draft) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const mine = tour.mine;
  const dirty = JSON.stringify(tour) !== JSON.stringify(draft);
  const set = (patch: Partial<TourDetail>) => {
    setDraft({ ...draft, ...patch });
    setNotice("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const body: TourEdit = {
        visitedOn: draft.visitedOn,
        overall: draft.overall,
        quick: draft.quick,
        // Keys left out of the draft were cleared: send them as null.
        scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, draft.scores[k] ?? null])),
        checks: Object.fromEntries(CHECK_KEYS.map((k) => [k, draft.checks[k] ?? null])),
        roomNotes: Object.fromEntries(ROOMS.map((r) => [r, draft.roomNotes[r] ?? ""])),
        pros: draft.pros,
        cons: draft.cons,
        agent: draft.agent,
        heard: draft.heard,
      };
      const x = await reApi.saveTour(id, body);
      setTour(x);
      setDraft(x);
      setNotice(t("realestate:tour.saved"));
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async () => {
    setError("");
    try {
      const picked = await pickPhotos();
      for (let i = 0; i < picked.length; i++) {
        setBusy(t("photo.uploading", { done: i, total: picked.length }));
        await photoApi.upload(tour.propertyId, picked[i], { room, tourId: id });
      }
      if (picked.length) loadPhotos(tour.propertyId);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!(await confirm(t("realestate:tour.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
    try {
      await reApi.removeTour(id);
      router.back();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const roomName = t(`realestate:room.${room}`);
  const roomPhotos = photos.filter((p) => (p.room ?? "other") === room);
  const textArea = (k: "pros" | "cons" | "agent" | "heard", placeholder?: string, multiline = true) => (
    <Field label={t(`realestate:tour.${k}`)} value={draft[k]} onChangeText={(v) => set({ [k]: v })} placeholder={placeholder} multiline={multiline} />
  );

  return (
    <FormScroll testID="tour" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: t("realestate:tour.title"),
          headerRight: mine
            ? () => (
                <Pressable accessibilityRole="button" onPress={save} disabled={saving || !dirty} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 6, opacity: dirty ? 1 : 0.4 }}>
                  <Text style={{ color: c.accent, fontSize: 16, fontWeight: "700" }}>{t("realestate:tour.save")}</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <Pressable onPress={() => router.navigate({ pathname: "/property/[id]", params: { id: tour.propertyId } })}>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: "700" }}>{tour.address}</Text>
      </Pressable>
      {!mine && <Body muted>{t("realestate:tour.notYours", { name: tour.name })}</Body>}
      {mine && <Field label={t("realestate:tour.date")} value={draft.visitedOn} onChangeText={(v) => set({ visitedOn: v })} placeholder="YYYY-MM-DD" />}

      <SectionTitle>{t("realestate:tour.rooms")}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {ROOMS.map((r) => {
          const n = photos.filter((p) => (p.room ?? "other") === r).length;
          const noted = !!draft.roomNotes[r];
          return <Chip key={r} label={`${t(`realestate:room.${r}`)}${n ? ` (${n})` : ""}${noted ? " ✎" : ""}`} selected={room === r} onPress={() => setRoom(r)} />;
        })}
      </View>
      {roomPhotos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {roomPhotos.map((p) => (
            <Image key={p.id} testID="tour-photo" source={apiImage(p.thumbUrl)} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: c.card }} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
      {mine && (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Chip icon="📷" label={t("realestate:tour.addPhotos", { room: roomName })} disabled={!!busy} onPress={addPhotos} />
            {busy ? <Body muted>{busy}</Body> : null}
          </View>
          <Field
            label={t("realestate:tour.roomNote", { room: roomName })}
            value={draft.roomNotes[room] ?? ""}
            onChangeText={(v) => set({ roomNotes: { ...draft.roomNotes, [room]: v } })}
          />
        </>
      )}

      <SectionTitle>{t("realestate:tour.scores")}</SectionTitle>
      {mine && <Body muted>{t("realestate:tour.scoreHint")}</Body>}
      <View style={{ gap: 8 }}>
        {SCORE_KEYS.map((k) => (
          <Dots
            key={k}
            label={t(`realestate:score.${k}`)}
            value={draft.scores[k]}
            onChange={
              mine
                ? (n) => {
                    const scores = { ...draft.scores };
                    if (n == null) delete scores[k];
                    else scores[k] = n;
                    set({ scores });
                  }
                : undefined
            }
          />
        ))}
      </View>

      <SectionTitle>{t("realestate:tour.checks")}</SectionTitle>
      {mine && <Body muted>{t("realestate:tour.checkHint")}</Body>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {CHECK_KEYS.map((k) => (
          <CheckChip
            key={k}
            label={t(`realestate:check.${k}`)}
            value={draft.checks[k]}
            onChange={(v) => {
              if (!mine) return;
              const checks = { ...draft.checks };
              if (v == null) delete checks[k];
              else checks[k] = v;
              set({ checks });
            }}
          />
        ))}
      </View>

      <SectionTitle>{t("realestate:tour.overall")}</SectionTitle>
      <Scale10 value={draft.overall} onChange={(overall) => mine && set({ overall })} />
      <SectionTitle>{t("realestate:tour.quick")}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {QUICK.map((q) => (
          <Chip key={q} label={t(`realestate:quick.${q}`)} selected={draft.quick === q} onPress={() => mine && set({ quick: draft.quick === q ? null : q })} />
        ))}
      </View>
      {textArea("pros")}
      {textArea("cons")}
      {textArea("agent", t("realestate:tour.agentPlaceholder"), false)}
      {textArea("heard", t("realestate:tour.heardPlaceholder"))}

      {mine && (
        <>
          <Button label={dirty ? t("realestate:tour.save") : notice || t("realestate:tour.save")} busy={saving} disabled={!dirty} onPress={save} />
          {notice ? (
            <Text testID="tour-saved" style={{ color: c.accent, fontWeight: "700" }}>
              {notice}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Chip label={t("realestate:tour.delete")} onPress={remove} />
          </View>
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}
