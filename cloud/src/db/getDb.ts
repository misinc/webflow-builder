import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(locals: App.Locals) {
  return drizzle(locals.runtime.env.DB, { schema });
}
