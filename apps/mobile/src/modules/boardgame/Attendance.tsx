import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Body, Chip, ErrorText, Field, Text, useColors } from "@/components/ui";
import { errorText } from "@/core/errors";
import { bgApi, type Night, type Rsvp } from "./api";
import { SectionTitle } from "./parts";

/**
 * Who's coming (before the night) / who came (after): my answer, everyone's answers, guests
 * without the app, and for the owner, hosts and picker, recording others.
 */
export function Attendance({ night, me, onChange }: { night: Night; me: string | null; onChange: (n: Night) => void }) {
  const { t } = useTranslation();
  const c = useColors();
  const [guest, setGuest] = useState("");
  const [others, setOthers] = useState(false);
  const [error, setError] = useState("");
  const past = night.status === "past";
  const a = night.attendance;
  const run = (p: Promise<Night>) =>
    p.then(
      (n) => {
        setError("");
        onChange(n);
      },
      (e) => setError(errorText(t, e)),
    );

  const answers: { status: Rsvp; label: string }[] = past
    ? [
        { status: "going", label: t("boardgame:rsvp.came") },
        { status: "no", label: t("boardgame:rsvp.didntCome") },
      ]
    : [
        { status: "going", label: t("boardgame:rsvp.going") },
        { status: "maybe", label: t("boardgame:rsvp.maybe") },
        { status: "no", label: t("boardgame:rsvp.no") },
      ];
  const names = (s: Rsvp) => a.rsvps.filter((r) => r.status === s).map((r) => r.name);
  const going = [...names("going"), ...a.guests.map((g) => `${g.name} (${t("boardgame:rsvp.guestTag")})`)];
  const rows: { label: string; list: string[] }[] = past
    ? [
        { label: t("boardgame:rsvp.cameList"), list: going },
        { label: t("boardgame:rsvp.missedList"), list: [...names("no"), ...names("maybe")] },
      ]
    : [
        { label: t("boardgame:rsvp.goingList"), list: going },
        { label: t("boardgame:rsvp.maybeList"), list: names("maybe") },
        { label: t("boardgame:rsvp.noList"), list: names("no") },
      ];

  return (
    <View style={{ gap: 10 }} testID="attendance">
      <SectionTitle>{past ? t("boardgame:rsvp.titlePast") : t("boardgame:rsvp.titleUpcoming")}</SectionTitle>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {answers.map((x) => (
          <Chip
            key={x.status}
            label={x.label}
            selected={night.myRsvp === x.status}
            onPress={() => run(bgApi.rsvp(night.id, night.myRsvp === x.status ? null : x.status))}
          />
        ))}
      </View>
      {a.rsvps.length === 0 && a.guests.length === 0 ? <Body muted>{t("boardgame:rsvp.nobody")}</Body> : null}
      {rows
        .filter((r) => r.list.length)
        .map((r) => (
          <Text key={r.label} style={{ color: c.text, fontSize: 15 }}>
            <Text style={{ color: c.muted, fontWeight: "700" }}>
              {r.label} ({r.list.length}){"  "}
            </Text>
            {r.list.join(", ")}
          </Text>
        ))}

      <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}>
          <Field label={t("boardgame:rsvp.addGuest")} value={guest} onChangeText={setGuest} placeholder={t("boardgame:rsvp.guest")} />
        </View>
        <Chip
          label={t("boardgame:rsvp.addGuestButton")}
          disabled={!guest.trim()}
          onPress={() => run(bgApi.addGuest(night.id, guest)).then(() => setGuest(""))}
        />
      </View>
      {a.guests.some((g) => g.canRemove) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {a.guests
            .filter((g) => g.canRemove)
            .map((g) => (
              <Chip key={g.id} label={`${g.name} ✕`} onPress={() => run(bgApi.removeGuest(night.id, g.id))} />
            ))}
        </View>
      )}

      {a.canEditOthers && (
        <>
          <View style={{ flexDirection: "row" }}>
            <Chip label={t("boardgame:rsvp.recordOthers")} selected={others} onPress={() => setOthers(!others)} />
          </View>
          {others &&
            night.members
              .filter((m) => m.id !== me)
              .map((m) => {
                const cur = a.rsvps.find((r) => r.userId === m.id)?.status ?? null;
                return (
                  <View key={m.id} testID="rsvp-member" style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={{ color: c.text, fontSize: 15, minWidth: 90 }}>{m.name}</Text>
                    {answers.map((x) => (
                      <Chip
                        key={x.status}
                        label={past ? (x.status === "going" ? t("boardgame:rsvp.markCame") : t("boardgame:rsvp.markNo")) : x.label}
                        selected={cur === x.status}
                        onPress={() => run(bgApi.rsvp(night.id, cur === x.status ? null : x.status, m.id))}
                      />
                    ))}
                  </View>
                );
              })}
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** "Up to 4 players · 6 coming" when the night's head count doesn't fit the game (from BGG). */
export function playerWarning(going: number, bgg: { minPlayers: number | null; maxPlayers: number | null } | null, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!bgg || going === 0) return null;
  if (bgg.maxPlayers && going > bgg.maxPlayers) return t("boardgame:rsvp.tooMany", { max: bgg.maxPlayers, going });
  if (bgg.minPlayers && going < bgg.minPlayers) return t("boardgame:rsvp.tooFew", { min: bgg.minPlayers, going });
  return null;
}
