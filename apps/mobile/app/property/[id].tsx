import { CHECK_KEYS, pricePerSqft, SCORE_KEYS, scoreAverage } from "@wanderbar/route";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, View } from "react-native";
import { FormScroll } from "@/components/FormScroll";
import { Body, Button, Card, Chip, ErrorText, Field, Loading, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { PhotoStrip } from "@/core/photos/PhotoStrip";
import { reApi, type Property, type Tour } from "@/modules/realestate/api";
import { factsLine, money, numText, parseNum, SectionTitle, StageBadge, StagePicker } from "@/modules/realestate/parts";

/** Today on this device, YYYY-MM-DD. */
const localToday = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const LINK_LABEL = { zillow: "Zillow", redfin: "Redfin", realtor: "Realtor.com" } as const;

/** A house: its facts and links, where it stands, everyone's visits, photos. */
export default function PropertyScreen() {
  const { id, existing } = useLocalSearchParams<{ id: string; existing?: string }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const [p, setP] = useState<Property | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoKey, setPhotoKey] = useState(0);

  const load = useCallback(() => {
    reApi.get(id).then(
      (x) => {
        setP(x);
        setError("");
      },
      (e) => setError(errorText(t, e)),
    );
  }, [id, t]);
  useFocusEffect(
    useCallback(() => {
      load();
      setPhotoKey((k) => k + 1);
    }, [load]),
  );

  if (!p) return error ? <ErrorText>{error}</ErrorText> : <Loading />;

  const update = async (e: Parameters<typeof reApi.update>[1]) => {
    setError("");
    try {
      setP(await reApi.update(id, e));
      return true;
    } catch (err) {
      setError(errorText(t, err));
      return false;
    }
  };
  const today = localToday();
  const mineToday = p.tours.find((x) => x.mine && x.visitedOn === today);
  const visit = async () => {
    if (mineToday) return router.push({ pathname: "/tour/[id]", params: { id: mineToday.id } });
    setBusy(true);
    try {
      const tour = await reApi.startTour(id);
      router.push({ pathname: "/tour/[id]", params: { id: tour.id } });
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirm(t("realestate:detail.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
    try {
      await reApi.remove(id);
      router.back();
    } catch (e) {
      setError(errorText(t, e));
    }
  };
  const ppsf = pricePerSqft(p.price, p.sqft);
  const extra = [
    ppsf ? t("realestate:facts.perSqft", { n: ppsf }) : "",
    p.yearBuilt ? t("realestate:facts.built", { year: p.yearBuilt }) : "",
    p.hoaMonthly ? t("realestate:facts.hoa", { n: money(p.hoaMonthly, i18n.language) }) : "",
    p.lotSqft ? `${t("realestate:facts.lotSqft")} ${p.lotSqft.toLocaleString("en-US")}` : "",
  ].filter(Boolean);

  return (
    <FormScroll testID="property" style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 820, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t("realestate:detail.title") }} />
      {existing ? <Body muted>{t("realestate:new.existing")}</Body> : null}
      <Text testID="property-address" style={{ color: c.text, fontSize: 22, fontWeight: "700" }}>
        {p.address}
      </Text>
      <StageBadge stage={p.stage} />
      {factsLine(t, i18n.language, p) ? <Text style={{ color: c.text, fontSize: 16 }}>{factsLine(t, i18n.language, p)}</Text> : null}
      {extra.length > 0 && <Body muted>{extra.join(" · ")}</Body>}
      {p.openHouse ? <Body>🕐 {t("realestate:facts.openHouse")}: {p.openHouse}</Body> : null}
      {p.memo ? <Body>{p.memo}</Body> : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {p.links.map((l) => (
          <Chip key={l.id} label={LINK_LABEL[l.kind] ?? l.kind} onPress={() => Linking.openURL(l.url)} />
        ))}
        <Chip label={t("realestate:detail.maps")} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`)} />
        <Chip label={t("realestate:detail.edit")} selected={editing} onPress={() => setEditing(!editing)} />
      </View>
      {editing && <EditFacts p={p} onSave={async (e) => (await update(e)) && setEditing(false)} />}

      <Button label={mineToday ? t("realestate:detail.continueTour") : `📝 ${t("realestate:detail.startTour")}`} busy={busy} onPress={visit} />

      <SectionTitle>{t("realestate:detail.stage")}</SectionTitle>
      <StagePicker value={p.stage} onChange={(stage) => update({ stage })} />
      {p.stage === "rejected" && <RejectReason value={p.rejectReason} onSave={(rejectReason) => update({ rejectReason })} />}

      <SectionTitle>{t("realestate:detail.tours")}</SectionTitle>
      {p.tours.length === 0 && <Body muted>{t("realestate:detail.noTours")}</Body>}
      {p.tours.map((x) => (
        <TourCard key={x.id} tour={x} />
      ))}

      <SectionTitle>{t("realestate:detail.photos")}</SectionTitle>
      <PhotoStrip key={photoKey} itemId={p.id} />

      {p.canDelete && (
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Chip label={t("realestate:detail.delete")} onPress={remove} />
        </View>
      )}
      <ErrorText>{error}</ErrorText>
    </FormScroll>
  );
}

function RejectReason({ value, onSave }: { value: string; onSave: (s: string) => void }) {
  const { t } = useTranslation();
  const [v, setV] = useState(value);
  return (
    <View style={{ gap: 6 }}>
      <Field label={t("realestate:detail.rejectReason")} value={v} onChangeText={setV} onSubmitEditing={() => onSave(v)} />
      {v !== value && (
        <View style={{ flexDirection: "row" }}>
          <Chip label={t("realestate:detail.save")} onPress={() => onSave(v)} />
        </View>
      )}
    </View>
  );
}

function EditFacts({ p, onSave }: { p: Property; onSave: (e: Parameters<typeof reApi.update>[1]) => void }) {
  const { t } = useTranslation();
  const [address, setAddress] = useState(p.address);
  const [f, setF] = useState({
    price: numText(p.price),
    beds: numText(p.beds),
    baths: numText(p.baths),
    sqft: numText(p.sqft),
    lotSqft: numText(p.lotSqft),
    yearBuilt: numText(p.yearBuilt),
    hoaMonthly: numText(p.hoaMonthly),
  });
  const [openHouse, setOpenHouse] = useState(p.openHouse);
  const [memo, setMemo] = useState(p.memo);
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  const field = (k: keyof typeof f, basis = 110) => (
    <View key={k} style={{ flexBasis: basis, flexGrow: 1 }}>
      <Field label={t(`realestate:facts.${k}`)} value={f[k]} onChangeText={(v) => setF({ ...f, [k]: v })} />
    </View>
  );
  const save = () => {
    const nums = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, parseNum(v, !(k === "beds" || k === "baths"))]));
    if (Object.values(nums).some((v) => v === undefined)) return setBad(true);
    setBad(false);
    onSave({ ...(nums as Record<string, number | null>), ...(address.trim() !== p.address ? { address: address.trim() } : {}), openHouse, memo, ...(url.trim() ? { url: url.trim() } : {}) });
  };
  return (
    <Card>
      <Field label={t("realestate:new.address")} value={address} onChangeText={setAddress} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {field("price", 160)}
        {field("beds", 70)}
        {field("baths", 70)}
        {field("sqft")}
        {field("lotSqft")}
        {field("yearBuilt")}
        {field("hoaMonthly")}
      </View>
      <Field label={t("realestate:facts.openHouse")} value={openHouse} onChangeText={setOpenHouse} placeholder={t("realestate:facts.openHousePlaceholder")} />
      <Field label={t("realestate:facts.memo")} value={memo} onChangeText={setMemo} multiline />
      <Field label={t("realestate:detail.addLink")} value={url} onChangeText={setUrl} placeholder="https://www.redfin.com/…" />
      {bad && <ErrorText>{t("realestate:new.badNumbers")}</ErrorText>}
      <Button label={t("realestate:detail.save")} onPress={save} />
    </Card>
  );
}

function TourCard({ tour }: { tour: Tour }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${tour.visitedOn}T00:00:00Z`));
  const avg = scoreAverage(tour.scores);
  const scored = SCORE_KEYS.filter((k) => tour.scores[k] != null);
  const checks = CHECK_KEYS.filter((k) => tour.checks[k] != null);
  return (
    <Card testID="tour-card">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, flex: 1 }}>{t("realestate:tour.by", { name: tour.name, date })}</Text>
        {tour.overall != null && <Text style={{ color: c.accent, fontWeight: "700", fontSize: 18 }}>{t("realestate:tour.outOf", { score: tour.overall })}</Text>}
      </View>
      {tour.quick && <Body>{t(`realestate:quick.${tour.quick}`)}</Body>}
      {tour.pros ? <Body>👍 {tour.pros}</Body> : null}
      {tour.cons ? <Body>⚠️ {tour.cons}</Body> : null}
      {scored.length > 0 && (
        <Body muted>
          {avg != null ? `★ ${avg} · ` : ""}
          {scored.map((k) => `${t(`realestate:score.${k}`)} ${tour.scores[k]}`).join(" · ")}
        </Body>
      )}
      {checks.length > 0 && <Body muted>{checks.map((k) => `${tour.checks[k] ? "✓" : "✗"} ${t(`realestate:check.${k}`)}`).join("  ")}</Body>}
      {Object.entries(tour.roomNotes).map(([room, note]) => (note ? <Body key={room} muted>{`${t(`realestate:room.${room}`)}: ${note}`}</Body> : null))}
      {tour.agent ? <Body muted>{`${t("realestate:tour.agent")}: ${tour.agent}`}</Body> : null}
      {tour.heard ? <Body muted>{`${t("realestate:tour.heard")}: ${tour.heard}`}</Body> : null}
      {tour.mine && (
        <View style={{ flexDirection: "row" }}>
          <Chip label={t("realestate:tour.edit")} onPress={() => router.push({ pathname: "/tour/[id]", params: { id: tour.id } })} />
        </View>
      )}
    </Card>
  );
}
