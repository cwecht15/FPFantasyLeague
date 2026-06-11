"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { lockChampionshipField } from "@/lib/championship/service";
import type { FormState } from "@/lib/leagues/actions";

export async function lockFieldAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Site admin only" };
  const season = Number(formData.get("season"));
  if (!season) return { error: "Season required" };

  const result = await lockChampionshipField(season);
  if (result.error) return { error: result.error };

  revalidatePath("/championship");
  return { error: null };
}
