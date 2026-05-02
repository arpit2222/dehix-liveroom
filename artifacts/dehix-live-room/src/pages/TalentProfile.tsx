import { useParams, useLocation } from "wouter";
import { useGetTalentProfile, useGetTalentCredentials, getGetTalentProfileQueryKey, getGetTalentCredentialsQueryKey } from "@workspace/api-client-react";
import { SBTCredentialCard } from "@/components/SBTCredentialCard";
import { ReputationRing } from "@/components/ReputationRing";
import { Button } from "@/components/ui/button";

export default function TalentProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { data: profileData, isLoading: loadingProfile } = useGetTalentProfile(id ?? "", { query: { enabled: !!id, queryKey: getGetTalentProfileQueryKey(id ?? "") } });
  const { data: credentials } = useGetTalentCredentials(id ?? "", { query: { enabled: !!id, queryKey: getGetTalentCredentialsQueryKey(id ?? "") } });

  const profile = (profileData as any);
  const user = profile?.user;
  const credList = Array.isArray(credentials) ? credentials : [];
  const overallRep = profile?.overallReputation ?? 0;

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Profile not found</p>
          <Button onClick={() => navigate(-1 as any)}>Go back</Button>
        </div>
      </div>
    );
  }

  const truncateWallet = (w: string) => w ? `${w.slice(0, 6)}...${w.slice(-4)}` : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1 as any)} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            Back
          </button>
          <span className="text-border">/</span>
          <span className="text-sm font-medium">Talent Profile</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="flex items-start gap-6 mb-10 pb-10 border-b border-border/40">
          <div className="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-xl">{user.name?.[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
                {user.walletAddress && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-mono text-muted-foreground bg-card border border-border/50 rounded px-2 py-0.5">
                      {truncateWallet(user.walletAddress)}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${user.isOnline ? "text-emerald-400" : "text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isOnline ? "bg-emerald-400" : "bg-gray-600"}`} />
                    {user.isOnline ? "Available" : "Offline"}
                  </span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground">Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ReputationRing score={overallRep} size={72} strokeWidth={6} />
                <span className="text-xs text-muted-foreground">Overall rep</span>
              </div>
            </div>
          </div>
        </div>

        <section>
          <h2 className="font-semibold mb-4">SBT Credentials ({credList.length})</h2>
          {credList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">No credentials issued yet</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {credList.map((cred: any) => (
                <SBTCredentialCard key={cred._id} credential={cred} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
