import { STAGES, type Stage } from "@wanderbar/route";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Chip, Text, useColors } from "@/components/ui";
import type { Facts } from "./api";

export const money = (n: number | null | undefined, locale: string) =>
  n == null ? "" : new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "$950,000 · 3 bd · 2 ba · 1,400 sq ft" */
export function factsLine(t: TFunction, locale: string, f: Partial<Facts>) {
  const parts: string[] = [];
  if (f.price != null) parts.push(money(f.price, locale));
  if (f.beds != null || f.baths != null) parts.push(t("realestate:facts.bedsBaths", { beds: f.beds != null ? num(f.beds) : "–", baths: f.baths != null ? num(f.baths) : "–" }));
  if (f.sqft != null) parts.push(t("realestate:facts.sqftShort", { n: f.sqft.toLocaleString("en-US") }));
  return parts.join(" · ");
}

export const SectionTitle = ({ children }: { children: string }) => {
  const c = useColors();
  return <Text style={{ color: c.muted, fontSize: 14, fontWeight: "700", marginTop: 6 }}>{children}</Text>;
};

/** 1–5 boxes; tapping the chosen one again clears it. */
export function Dots({ label, value, onChange }: { label: string; value: number | null | undefined; onChange?: (n: number | null) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ color: c.text, fontSize: 15, flex: 1, minWidth: 90 }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = (value ?? 0) >= n;
          return (
            <Pressable
              key={n}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${n}`}
              accessibilityState={{ selected: value === n }}
              disabled={!onChange}
              onPress={() => onChange?.(value === n ? null : n)}
              hitSlop={4}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: on ? c.accent : c.border,
                backgroundColor: on ? c.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: on ? (c.dark ? c.onPink : "#fff") : c.muted, fontWeight: "700" }}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** 1–10 overall. */
export function Scale10({ value, onChange }: { value: number | null | undefined; onChange: (n: number | null) => void }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", gap: 4, maxWidth: 480 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
        const on = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t("realestate:tour.outOf", { score: n })}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on ? null : n)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 26,
              height: 42,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: on ? c.accent : c.border,
              backgroundColor: on ? c.accent : (value ?? 0) >= n ? `${c.accent}33` : "transparent",
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: on ? (c.dark ? c.onPink : "#fff") : c.text, fontWeight: "700" }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Yes → no → not checked. */
export function CheckChip({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean | null) => void }) {
  const mark = value === true ? "✓" : value === false ? "✗" : "·";
  return <Chip label={`${mark} ${label}`} selected={value === true} onPress={() => onChange(value === true ? false : value === false ? null : true)} />;
}

export function StagePicker({ value, onChange, only }: { value: Stage; onChange: (s: Stage) => void; only?: readonly Stage[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {(only ?? STAGES).map((s) => (
        <Chip key={s} label={t(`realestate:stage.${s}`)} selected={value === s} onPress={() => onChange(s)} />
      ))}
    </View>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const c = useColors();
  const { t } = useTranslation();
  const strong = stage === "considering" || stage === "offered" || stage === "contract";
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: stage === "rejected" ? c.border : strong ? c.pink : c.pinkSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", color: strong ? c.onPink : c.text }}>{t(`realestate:stage.${stage}`)}</Text>
    </View>
  );
}

/** Number field text → number (blank = null). */
export const parseNum = (s: string, int = true) => {
  const v = s.replace(/[$,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? (int ? Math.round(n) : Math.round(n * 2) / 2) : undefined;
};
export const numText = (n: number | null | undefined) => (n == null ? "" : String(n));
