import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Body, Chip, ErrorText, useColors } from "@/components/ui";
import { apiImage } from "@/core/api";
import { errorText } from "@/core/errors";
import { confirm } from "@/core/platform/confirm";
import { pickPhotos } from "@/core/platform/photos";
import { useSession } from "@/core/session";
import { photoApi, type Photo } from "./api";

/**
 * The group's photos of a restaurant (with its menus'), a menu or a dish, and "Add photos".
 * Photos are optional; a photo's camera time can add a visit / "made it", so onChange lets the page reload.
 */
export function PhotoStrip({ itemId, onChange }: { itemId: string; onChange?: () => void }) {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const { state } = useSession();
  const me = state.status === "signedIn" ? state.user.id : null;
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Photo | null>(null);

  const load = useCallback(() => {
    photoApi
      .list(itemId)
      .then(setPhotos)
      .catch((e) => setError(errorText(t, e)));
  }, [itemId, t]);
  useEffect(load, [load]);

  const add = async () => {
    setError("");
    try {
      const picked = await pickPhotos();
      for (let i = 0; i < picked.length; i++) {
        setBusy(t("photo.uploading", { done: i, total: picked.length }));
        await photoApi.upload(itemId, picked[i]);
      }
      if (picked.length) {
        load();
        onChange?.();
      }
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy("");
    }
  };

  const remove = async (p: Photo) => {
    if (!(await confirm(t("photo.confirmDelete"), t("common.delete"), t("common.cancel")))) return;
    try {
      await photoApi.remove(p.id);
      setOpen(null);
      load();
      onChange?.();
    } catch (e) {
      setError(errorText(t, e));
    }
  };

  const when = (p: Photo) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(p.takenAt ?? p.createdAt));

  return (
    <View style={{ gap: 8 }} testID="photos">
      {photos && photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p) => (
            <Pressable key={p.id} accessibilityRole="imagebutton" accessibilityLabel={t("photo.open")} onPress={() => setOpen(p)}>
              <Image testID="photo-thumb" source={apiImage(p.url)} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: c.card }} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Chip label={t("photo.add")} disabled={!!busy} onPress={add} />
        {busy ? <Body muted>{busy}</Body> : null}
      </View>
      <ErrorText>{error}</ErrorText>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", padding: 12 }} onPress={() => setOpen(null)}>
          {open && (
            <View style={{ gap: 10, width: "100%", maxWidth: 900, alignSelf: "center" }}>
              <Image testID="photo-full" source={apiImage(open.url)} style={{ width: "100%", aspectRatio: open.width && open.height ? open.width / open.height : 4 / 3 }} resizeMode="contain" />
              <Text style={{ color: "#fff", fontSize: 14 }}>
                {[open.itemName, open.name, when(open)].filter(Boolean).join(" · ")}
              </Text>
              {open.uploadedBy === me && (
                <View style={{ flexDirection: "row" }}>
                  <Chip label={t("photo.delete")} onPress={() => remove(open)} />
                </View>
              )}
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
