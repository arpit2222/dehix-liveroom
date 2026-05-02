import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { io, type Socket } from "socket.io-client";
import {
  collection, addDoc, onSnapshot, orderBy, query as fsQuery, serverTimestamp
} from "firebase/firestore";
import { db, isFirebaseEnabled } from "@/lib/firebase";
import {
  useGetRoom, useGetRoomTickets, useGetRoomMilestones, useGetRoomNda,
  useCreateTicket, useUpdateTicket, useCreateMilestone, useSignNda, useGenerateNda,
  useAiChat, useAssembleSquad,
  getGetRoomQueryKey, getGetRoomTicketsQueryKey, getGetRoomMilestonesQueryKey, getGetRoomNdaQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";

type TabKey = "brief" | "tickets" | "milestones" | "nda";

const TICKET_COLUMNS = [
  { key: "backlog" as const, label: "Backlog" },
  { key: "todo" as const, label: "Todo" },
  { key: "in_progress" as const, label: "In Progress" },
  { key: "done" as const, label: "Done" },
];

const STATUS_COLORS: Record<string, string> = {
  scoping: "text-blue-400 bg-blue-950/40 border-blue-800/40",
  matching: "text-amber-400 bg-amber-950/40 border-amber-800/40",
  open: "text-emerald-400 bg-emerald-950/40 border-emerald-800/40",
  assembling: "text-violet-400 bg-violet-950/40 border-violet-800/40",
  contracted: "text-cyan-400 bg-cyan-950/40 border-cyan-800/40",
  closed: "text-gray-400 bg-gray-950/40 border-gray-700/40",
};

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  isAi: boolean;
  createdAt: any;
}

let localMsgId = 0;

export default function LiveRoom() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("brief");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneAmount, setNewMilestoneAmount] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const roomId = id ?? "";

  const { data: roomData, isLoading: loadingRoom } = useGetRoom(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomQueryKey(roomId) },
  });
  const { data: ticketsData, refetch: refetchTickets } = useGetRoomTickets(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomTicketsQueryKey(roomId) },
  });
  const { data: milestonesData, refetch: refetchMilestones } = useGetRoomMilestones(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomMilestonesQueryKey(roomId) },
  });
  const { data: ndaData, refetch: refetchNda } = useGetRoomNda(roomId, {
    query: { enabled: !!id, queryKey: getGetRoomNdaQueryKey(roomId) },
  });

  const room = roomData as any;
  const tickets = Array.isArray(ticketsData) ? ticketsData : [];
  const milestones = Array.isArray(milestonesData) ? milestonesData : [];
  const nda = ndaData as any;

  const addLocalMessage = useCallback((msg: Omit<ChatMessage, "id" | "createdAt">) => {
    const newMsg: ChatMessage = { ...msg, id: String(++localMsgId), createdAt: new Date() };
    setChatMessages((prev) => [...prev, newMsg]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const createTicket = useCreateTicket({
    mutation: { onSuccess: () => { setNewTicketTitle(""); refetchTickets(); } },
  });
  const updateTicket = useUpdateTicket({
    mutation: { onSuccess: () => refetchTickets() },
  });
  const createMilestone = useCreateMilestone({
    mutation: {
      onSuccess: () => { setNewMilestoneTitle(""); setNewMilestoneAmount(""); refetchMilestones(); },
    },
  });
  const signNda = useSignNda({
    mutation: { onSuccess: () => refetchNda() },
  });
  const generateNda = useGenerateNda({
    mutation: { onSuccess: () => refetchNda() },
  });
  const assembleSquad = useAssembleSquad({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }) },
  });
  const aiChat = useAiChat({
    mutation: {
      onSuccess: async (data: any) => {
        if (!data.reply) return;
        const aiMsg = { userId: "ai", userName: "DEHIX AI", message: data.reply, isAi: true };
        if (isFirebaseEnabled && db) {
          await addDoc(collection(db, `liverooms/${roomId}/messages`), {
            ...aiMsg,
            createdAt: serverTimestamp(),
          });
        } else {
          addLocalMessage(aiMsg);
        }
      },
    },
  });

  useEffect(() => {
    if (!roomId || !user) return;
    const socket = io(window.location.origin, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.emit("room:join", { roomId, userId: user._id });
    socket.on("room:participant_joined", () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }));
    socket.on("room:ticket_updated", () => refetchTickets());
    socket.on("room:milestone_updated", () => refetchMilestones());
    socket.on("room:nda_signed", () => refetchNda());
    socket.on("room:squad_formed", () => queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) }));
    return () => { socket.disconnect(); };
  }, [roomId, user]);

  useEffect(() => {
    if (!roomId || !isFirebaseEnabled || !db) return;
    const q = fsQuery(
      collection(db, `liverooms/${roomId}/messages`),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(msgs);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    });
    return () => unsub();
  }, [roomId]);

  const sendChat = async () => {
    if (!chatInput.trim() || !roomId || !user) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), {
        ...msgData,
        createdAt: serverTimestamp(),
      });
    } else {
      addLocalMessage(msgData);
    }
  };

  const askAi = async () => {
    if (!chatInput.trim() || !roomId || !user) return;
    const msg = chatInput.trim();
    setChatInput("");
    const msgData = { userId: user._id, userName: user.name, message: msg, isAi: false };
    if (isFirebaseEnabled && db) {
      await addDoc(collection(db, `liverooms/${roomId}/messages`), {
        ...msgData,
        createdAt: serverTimestamp(),
      });
    } else {
      addLocalMessage(msgData);
    }
    aiChat.mutate({ data: { message: msg, roomId } });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please sign in to join this room</p>
          <Button onClick={() => navigate("/login")}>Sign in</Button>
        </div>
      </div>
    );
  }
  if (loadingRoom) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading room...</div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Room not found</p>
          <Button onClick={() => navigate("/business/dashboard")}>Back</Button>
        </div>
      </div>
    );
  }

  const brief = room.aiScopedBrief as any;
  const roles = room.roles ?? [];
  const participants = room.participants ?? [];
  const isBusiness = user?.role === "business";
  const isOwner = isBusiness;
  const allRolesFilled = roles.length > 0 && roles.every((r: any) => ["filled", "accepted"].includes(r.status));
  const isSignedByMe = nda?.signedBy?.includes(user?._id ?? "");

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* TOP BAR */}
      <div className="shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="h-12 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(isBusiness ? "/business/dashboard" : "/talent/dashboard")}
              className="text-muted-foreground hover:text-foreground transition-colors text-sm shrink-0"
            >
              ← Back
            </button>
            <span className="text-border/40 shrink-0">/</span>
            <span className="font-semibold text-sm truncate">{room.title}</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize shrink-0 ${STATUS_COLORS[room.status] ?? ""}`}>
              {room.status}
            </span>
            <span className="text-xs font-mono text-muted-foreground shrink-0 hidden sm:inline">{room.roomCode}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isFirebaseEnabled && (
              <span className="text-[10px] text-amber-400 border border-amber-800/40 bg-amber-950/30 rounded px-2 py-0.5 hidden sm:inline">
                Demo chat
              </span>
            )}
            {room.meetLink && (
              <a href={room.meetLink} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="text-xs h-7">Meet</Button>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 3-COLUMN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT */}
        <div className="w-56 shrink-0 border-r border-border/40 flex flex-col overflow-y-auto bg-card/30">
          <div className="p-3 space-y-5">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Roles ({roles.length})
              </div>
              {roles.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-2">No roles defined</div>
              ) : (
                <div className="space-y-1.5">
                  {roles.map((role: any) => (
                    <div key={role._id} className="rounded-lg border border-border/30 bg-background/40 p-2">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <span className="text-xs font-medium text-foreground leading-tight line-clamp-2">{role.roleTitle}</span>
                        <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded border capitalize ml-1 ${
                          role.status === "filled" ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" :
                          role.status === "accepted" ? "text-cyan-400 bg-cyan-950/40 border-cyan-800/40" :
                          "text-amber-400 bg-amber-950/40 border-amber-800/40"
                        }`}>
                          {role.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{role.skillDomain}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        L{role.requiredLevel} · {role.minReputation}+ rep
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Participants ({participants.length})
              </div>
              {participants.length === 0 ? (
                <div className="text-xs text-muted-foreground/50 py-2">Waiting for talent</div>
              ) : (
                <div className="space-y-1.5">
                  {participants.map((p: any) => {
                    const u = p.user ?? (typeof p.userId === "object" ? p.userId : null);
                    return (
                      <button
                        key={p._id}
                        onClick={() => u?._id && navigate(`/talent/profile/${u._id}`)}
                        className="w-full text-left rounded-lg border border-border/30 bg-background/40 p-2 hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                            <span className="text-primary font-bold text-[9px]">{u?.name?.[0]?.toUpperCase() ?? "?"}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{u?.name ?? "User"}</div>
                            <div className={`text-[10px] ${p.status === "joined" ? "text-emerald-400" : "text-muted-foreground"}`}>
                              {p.status}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="shrink-0 border-b border-border/40 px-4 flex items-center gap-1 h-10">
            {(["brief", "tickets", "milestones", "nda"] as TabKey[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
                {t === "tickets" && tickets.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{tickets.length}</span>
                )}
                {t === "milestones" && milestones.length > 0 && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{milestones.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* BRIEF */}
            {tab === "brief" && (
              <div className="space-y-4 max-w-2xl">
                {!brief ? (
                  <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                    <p className="text-sm text-muted-foreground">No AI brief yet</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                      <div className="text-xs text-primary font-medium uppercase tracking-wider mb-2">AI Project Brief</div>
                      <h2 className="font-bold text-lg mb-1">{brief.projectTitle}</h2>
                      <p className="text-sm text-muted-foreground leading-relaxed">{brief.projectSummary}</p>
                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          <span className="text-foreground/80 font-mono font-semibold">{brief.estimatedWeeks}w</span> timeline
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          <span className="text-foreground/80 font-semibold">{brief.complexity}</span> complexity
                        </span>
                        {brief.suggestedTotalBudgetUsd && (
                          <span className="text-xs text-muted-foreground">
                            <span className="text-foreground/80 font-mono font-semibold">${brief.suggestedTotalBudgetUsd?.toLocaleString()}</span> budget
                          </span>
                        )}
                      </div>
                    </div>
                    {brief.technicalRisks?.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Technical Risks</div>
                        <div className="space-y-1.5">
                          {brief.technicalRisks.map((r: string, i: number) => (
                            <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 text-destructive/80">
                              {r}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TICKETS */}
            {tab === "tickets" && (
              <div className="space-y-4">
                {isBusiness && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newTicketTitle.trim()) {
                        createTicket.mutate({ id: roomId, data: { title: newTicketTitle, milestoneNumber: 1 } });
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={newTicketTitle}
                      onChange={(e) => setNewTicketTitle(e.target.value)}
                      placeholder="New ticket title..."
                      className="flex-1 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                    />
                    <Button size="sm" type="submit" disabled={createTicket.isPending}>Add</Button>
                  </form>
                )}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {TICKET_COLUMNS.map((col) => {
                    const colTickets = tickets.filter((t: any) => t.status === col.key);
                    return (
                      <div key={col.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{col.label}</span>
                          <span className="text-xs text-muted-foreground/50">{colTickets.length}</span>
                        </div>
                        <div className="space-y-1.5 min-h-[80px]">
                          {colTickets.map((t: any) => (
                            <div key={t._id} className="rounded-lg border border-border/40 bg-card p-2.5 group">
                              <p className="text-xs font-medium leading-tight mb-1.5">{t.title}</p>
                              {t.estimatedHours && (
                                <span className="text-[10px] text-muted-foreground font-mono">{t.estimatedHours}h</span>
                              )}
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {TICKET_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                                  <button
                                    key={c.key}
                                    onClick={() => updateTicket.mutate({ id: t._id, data: { status: c.key } })}
                                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    → {c.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MILESTONES */}
            {tab === "milestones" && (
              <div className="space-y-4 max-w-2xl">
                {isBusiness && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (newMilestoneTitle.trim()) {
                        createMilestone.mutate({
                          id: roomId,
                          data: { title: newMilestoneTitle, amountUsd: newMilestoneAmount ? Number(newMilestoneAmount) : undefined },
                        });
                      }
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      placeholder="Milestone title..."
                      className="flex-1 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 placeholder:text-muted-foreground/50"
                    />
                    <input
                      value={newMilestoneAmount}
                      onChange={(e) => setNewMilestoneAmount(e.target.value)}
                      placeholder="$USD"
                      type="number"
                      className="w-24 bg-card border border-border/50 rounded-md px-3 py-1.5 text-sm outline-none focus:border-primary/50 font-mono placeholder:text-muted-foreground/50"
                    />
                    <Button size="sm" type="submit" disabled={createMilestone.isPending}>Add</Button>
                  </form>
                )}
                {milestones.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                    <p className="text-sm text-muted-foreground">No milestones yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {milestones.map((m: any, i: number) => (
                      <div key={m._id} className="rounded-xl border border-border/40 bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-primary text-[10px] font-bold">{i + 1}</span>
                            </div>
                            <div>
                              <h3 className="font-semibold text-sm">{m.title}</h3>
                              {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {m.amountUsd != null && (
                              <div className="font-mono font-bold text-sm">${m.amountUsd.toLocaleString()}</div>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${
                              m.status === "released" ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" :
                              "text-muted-foreground bg-muted/30 border-border/40"
                            }`}>
                              {m.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-lg border border-border/30 bg-card/50 px-4 py-2.5 text-xs text-muted-foreground flex items-center justify-between">
                      <span>Total escrow</span>
                      <span className="font-mono font-semibold text-foreground">
                        ${milestones.reduce((s: number, m: any) => s + (m.amountUsd ?? 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* NDA */}
            {tab === "nda" && (
              <div className="space-y-4 max-w-2xl">
                {!nda ? (
                  <div className="rounded-xl border border-dashed border-border/50 p-8 text-center">
                    <p className="text-sm text-muted-foreground mb-4">No NDA generated yet</p>
                    {isOwner && (
                      <Button
                        size="sm"
                        onClick={() => generateNda.mutate({ data: { roomId } })}
                        disabled={generateNda.isPending}
                      >
                        {generateNda.isPending ? "Generating..." : "Generate NDA"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <StatusBadge status={nda.status === "signed" ? "verified" : nda.status === "pending_signatures" ? "disputed" : "revoked"} />
                      <div className="text-xs text-muted-foreground">{nda.signedBy?.length ?? 0} signatures</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/50 p-5 max-h-72 overflow-y-auto">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                        {nda.content}
                      </pre>
                    </div>
                    {!isSignedByMe && nda.status !== "signed" && (
                      <Button className="w-full" onClick={() => signNda.mutate({ id: roomId })} disabled={signNda.isPending}>
                        Sign NDA
                      </Button>
                    )}
                    {isSignedByMe && (
                      <div className="text-center text-xs text-emerald-400 font-medium py-2">
                        You have signed this NDA ✓
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {isOwner && allRolesFilled && room.status === "open" && (
            <div className="shrink-0 border-t border-border/40 p-3">
              <Button
                className="w-full glow-purple"
                onClick={() => assembleSquad.mutate({ id: roomId })}
                disabled={assembleSquad.isPending}
              >
                {assembleSquad.isPending ? "Forming Squad..." : "Form Squad and Sign NDA"}
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT: Chat */}
        <div className="w-72 shrink-0 border-l border-border/40 flex flex-col overflow-hidden bg-card/20">
          <div className="shrink-0 border-b border-border/40 p-3">
            {room.meetLink ? (
              <a href={room.meetLink} target="_blank" rel="noreferrer" className="block">
                <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2.5 text-center hover:border-emerald-700/60 transition-colors">
                  <div className="text-xs text-emerald-400 font-medium">Google Meet</div>
                  <div className="text-[10px] text-emerald-400/60 mt-0.5">Click to join video call</div>
                </div>
              </a>
            ) : (
              <div className="rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground">No video link yet</div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-3 py-2 border-b border-border/40 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Live Chat</span>
            {!isFirebaseEnabled && (
              <span className="text-[9px] text-amber-400/70 font-medium">demo mode</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {chatMessages.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <p className="text-xs text-muted-foreground/40">Start the conversation</p>
                {!isFirebaseEnabled && (
                  <p className="text-[10px] text-muted-foreground/30 leading-relaxed px-2">
                    Chat is session-only in demo mode. Add Firebase keys for persistence.
                  </p>
                )}
              </div>
            )}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg p-2 text-xs ${msg.isAi ? "bg-primary/10 border border-primary/20" : "bg-card border border-border/30"}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {msg.isAi && (
                    <span className="text-[9px] bg-primary/20 text-primary border border-primary/30 rounded px-1 py-0.5 font-semibold">AI</span>
                  )}
                  <span className={`text-[11px] font-medium ${msg.isAi ? "text-primary" : "text-foreground/80"}`}>
                    {msg.userName}
                  </span>
                </div>
                <p className="text-foreground/85 leading-relaxed">{msg.message}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="shrink-0 border-t border-border/40 p-2.5 space-y-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
              }}
              placeholder="Message... (Enter to send)"
              className="w-full bg-card border border-border/50 rounded-md px-2.5 py-2 text-xs outline-none focus:border-primary/50 placeholder:text-muted-foreground/40 resize-none min-h-[52px]"
              rows={2}
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1 text-xs h-7" onClick={sendChat} disabled={!chatInput.trim()}>
                Send
              </Button>
              <Button size="sm" className="flex-1 text-xs h-7" onClick={askAi} disabled={!chatInput.trim() || aiChat.isPending}>
                {aiChat.isPending ? "..." : "Ask AI"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
