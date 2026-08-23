import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ensureSeeded } from "../db/seed";
import { getDeviceStaff, setDeviceStaff } from "../db/queries/identity";
import type { Staff } from "../types/db";

// Boot state for the whole app: the shop this install belongs to, and which
// staff member this phone is (spec Part B §5, Part C §1 §2).
//
// Note the states below: there is no "signed out" and no "locked". A phone is
// either still opening its local DB, waiting to learn whose phone it is, or
// ready. A PIN/password lock was drafted and explicitly rejected — do not
// reintroduce one here (CLAUDE.md, Security).

type Status = "loading" | "needs-identity" | "ready" | "error";

interface AppContextValue {
  status: Status;
  error: string | null;
  businessId: string | null;
  staff: Staff | null;
  // Called by the first-launch name picker once a name is chosen.
  chooseStaff: (staff: Staff) => Promise<void>;
  retry: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

// Convenience for screens that only ever render once boot has finished, which
// is all of them behind the gate in RootNavigator.
export function useReadyApp(): { businessId: string; staff: Staff } {
  const { businessId, staff } = useApp();
  if (!businessId || !staff) {
    throw new Error("useReadyApp used before the app finished booting");
  }
  return { businessId, staff };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("loading");
      setError(null);
      try {
        // Local-only: opens SQLite and pre-loads the real catalog. Never
        // reaches the network, so a cold start works with no signal (G8).
        const { businessId: id } = await ensureSeeded();
        const existing = await getDeviceStaff(id);
        if (cancelled) return;
        setBusinessId(id);
        setStaff(existing);
        setStatus(existing ? "ready" : "needs-identity");
      } catch (err) {
        if (cancelled) return;
        console.error("[AppProvider] boot failed", err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const chooseStaff = useCallback(
    async (next: Staff) => {
      if (!businessId) return;
      await setDeviceStaff(businessId, next.id);
      setStaff(next);
      setStatus("ready");
    },
    [businessId]
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo(
    () => ({ status, error, businessId, staff, chooseStaff, retry }),
    [status, error, businessId, staff, chooseStaff, retry]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
