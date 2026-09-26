/** Pilih nomor berikutnya tanpa menimpa nama perangkat yang sudah pernah dipakai. */
export function nextDeviceName(workerName: string, existingNames: string[]): string {
  const base = workerName.trim() || "Worker";
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  let number = 1;
  while (used.has(`${base}-${number}`.toLocaleLowerCase())) number += 1;
  return `${base}-${number}`;
}

export function workerDisplayName(
  profileName: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  return [profileName, metadata?.["organization_name"], metadata?.["full_name"], metadata?.["name"], metadata?.["username"], email?.split("@")[0]]
    .find((name): name is string => typeof name === "string" && name.trim().length > 0) ?? "Worker";
}