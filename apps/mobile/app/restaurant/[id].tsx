import { useLocalSearchParams } from "expo-router";
import { RestaurantView } from "@/modules/food/restaurants/RestaurantView";

/** A saved restaurant (the same view a restaurant stop in a day route shows). */
export default function RestaurantScreen() {
  const { id, existing } = useLocalSearchParams<{ id: string; existing?: string }>();
  return <RestaurantView id={id} existing={!!existing} />;
}
