import { deleteE2eUsers } from "./helpers";

export default async function globalTeardown() {
  await deleteE2eUsers();
}
