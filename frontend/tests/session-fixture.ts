export async function verifiedAccount(id = "account-a", token = "account-a-token") {
  const users = await import("../src/services/users");
  users.setStoredAuthToken(token);
  users.verifySession({ id, displayName: id, email: null, role: "player", isActive: true, createdAt: "" }, token, users.storedSessionVersion());
}
