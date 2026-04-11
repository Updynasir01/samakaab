import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getToken, settingsApi } from "./api.js";
import { useAuth } from "./auth.jsx";
import { DEFAULT_COMPANY, mergeCompanyProfile } from "./companyProfile.js";

const CompanyProfileContext = createContext(null);

export function CompanyProfileProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(() => mergeCompanyProfile(null));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setProfile(mergeCompanyProfile(null));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await settingsApi.getCompany();
      setProfile(mergeCompanyProfile(data));
    } catch {
      setProfile(mergeCompanyProfile(null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, user, refresh]);

  const value = useMemo(() => ({ profile, loading, refresh }), [profile, loading, refresh]);
  return <CompanyProfileContext.Provider value={value}>{children}</CompanyProfileContext.Provider>;
}

export function useCompanyProfile() {
  const ctx = useContext(CompanyProfileContext);
  if (!ctx) throw new Error("useCompanyProfile must be used within CompanyProfileProvider");
  return ctx;
}
