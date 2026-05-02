import { useLocation } from "wouter";
import { useGetTalentInvites, useGetTalentCredentials, useRespondInvite, useUpdateAvailability, getGetTalentInvitesQueryKey, getGetTalentCredentialsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { SBTCredentialCard } from "@/components/SBTCredentialCard";
import { ReputationRing } from "@/components/ReputationRing";
import { Button } from "@/components/ui/button";

export default function TalentDashboard() {
  const [, navigate] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { data: invites, refetch: refetchInvites } = useGetTalentInvites({ query: { enabled: isAuthenticated, queryKey: getGetTalentInvitesQueryKey() } });
  const { data: credentials } = useGetTalentCredentials(user?._id ?? "", { query: { enabled: !!user?._id, queryKey: getGetTalentCredentialsQueryKey(user?._id ?? "") } });

  const updateAvailability = useUpdateAvailability({
    mutation: { onSuccess: () => {} },
  });

  const respondInvite = useRespondInvite({
    mutation: { onSuccess: () => refetchInvites() },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  const credList = Array.isArray(credentials) ? credentials : [];
  const inviteList = Array.isArray(invites) ? invites : [];
  const overallRep =
    credList.length > 0
      ? Math.round(credList.reduce((s: number, c: any) => s + (c.reputationScore ?? 0), 0) / credList.length)
      : 0;

  const isOnline = user?.isOnline ?? false;

  const toggleOnline = () => {
    updateAvailability.mutate({ data: { isOnline: !isOnline } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary/20 border border-primary/40 flex items-center justify-center">
              <span className="text-primary font-bold text-[10px]">DX</span>
            </div>
            <span className="font-medium text-sm">{user?.name}</span>
            <span className="text-xs text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">Talent</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={isOnline ? "default" : "outline"}
              onClick={toggleOnline}
              className={isOnline ? "bg-emerald-700 hover:bg-emerald-600 border-emerald-600" : ""}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? "bg-emerald-300" : "bg-gray-500"}`} />
              {isOnline ? "Available" : "Offline"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/talent/profile/${user?._id}`)}>
              Profile
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-6 mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Talent Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Your credentials, invitations, and availability</p>
          </div>
          <div className="flex items-center gap-3">
            <ReputationRing score={overallRep} size={64} />
            <div>
              <div className="text-xs text-muted-foreground">Overall Reputation</div>
              <div className="font-bold font-mono text-foreground">{overallRep}</div>
              <div className="text-xs text-muted-foreground">{credList.length} credential{credList.length !== 1 ? "s" : ""}</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Active Invitations</h2>
              {inviteList.length > 0 && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 rounded-full px-2 py-0.5">
                  {inviteList.length}
                </span>
              )}
            </div>
            {inviteList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">No pending invitations</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Set yourself as available to receive invites</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inviteList.map((invite: any) => (
                  <div key={invite._id} className="rounded-xl border border-border/50 bg-card p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-sm leading-tight">{invite.room?.title ?? "Unknown project"}</h3>
                      {invite.role && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-primary font-medium">{invite.role.roleTitle}</span>
                          <span className="text-xs text-muted-foreground">{invite.role.skillDomain}</span>
                        </div>
                      )}
                      {invite.role?.minReputation > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Min reputation: <span className="font-mono text-foreground/70">{invite.role.minReputation}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          respondInvite.mutate({ data: { participantId: invite._id, action: "accept" } });
                          if (invite.roomId) navigate(`/room/${invite.roomId}`);
                        }}
                      >
                        Join Room
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondInvite.mutate({ data: { participantId: invite._id, action: "decline" } })}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="font-semibold mb-4">SBT Credentials</h2>
            {credList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">No credentials issued yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {credList.map((cred: any) => (
                  <SBTCredentialCard key={cred._id} credential={cred} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
